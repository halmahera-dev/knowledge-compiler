"""Turning a saved URL or pasted blob into clean text.

Save-by-link fetches and extracts server-side (HLD §3.3) so the browser extension
stays thin and the same extraction path serves all three capture modes.
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
import socket
import unicodedata
from urllib.parse import urljoin, urlparse

import httpx
import structlog
import trafilatura

from app.core.config import get_settings

log = structlog.get_logger(__name__)

_WHITESPACE_RE = re.compile(r"[ \t]+")
_BLANKLINES_RE = re.compile(r"\n{3,}")
_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


class FetchError(RuntimeError):
    pass


def normalize_content(text: str) -> str:
    """Collapse incidental whitespace differences so re-saves hash identically."""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _WHITESPACE_RE.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    return _BLANKLINES_RE.sub("\n\n", text).strip()


def content_hash(text: str) -> str:
    """Stable identity for a piece of content, used to make re-saving a no-op."""
    return hashlib.sha256(normalize_content(text).encode("utf-8")).hexdigest()


def slugify(value: str, *, fallback: str = "untitled") -> str:
    ascii_form = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = _SLUG_STRIP_RE.sub("-", ascii_form.lower()).strip("-")
    return slug[:80] or fallback


def _assert_public_url(url: str) -> None:
    """Reject non-public URLs.

    The URL comes from a user, but it is fetched by the server, so without this a
    saved link could be pointed at cloud metadata endpoints or services on the
    host network and their responses stored in the wiki.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FetchError(f"unsupported URL scheme: {parsed.scheme or '(none)'}")
    if not parsed.hostname:
        raise FetchError("URL has no host")

    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise FetchError(f"could not resolve {parsed.hostname}") from exc

    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_multicast
        ):
            raise FetchError(f"refusing to fetch a non-public address ({address})")


async def _get_following_redirects(
    client: httpx.AsyncClient, url: str, *, max_redirects: int
) -> httpx.Response:
    """GET ``url``, validating every hop before it is requested.

    Redirects are followed by hand because ``follow_redirects=True`` defeats the
    guard entirely: httpx would chase a ``302 Location: http://169.254.169.254/``
    and fetch the metadata endpoint, and only afterwards would the final URL be
    checked. Refusing to store the response is not the same as refusing to make
    the request — a blind SSRF has already happened by then, and services that act
    on a GET have already acted.

    Checking before each hop means a private address is never contacted at all.
    """
    current = url
    for _ in range(max_redirects + 1):
        _assert_public_url(current)
        response = await client.get(current)

        if not response.is_redirect:
            return response

        location = response.headers.get("location")
        if not location:
            # A redirect status with nowhere to go; treat it as the answer rather
            # than looping.
            return response
        # Resolved against the current URL, since Location is often relative.
        current = urljoin(current, location)

    raise FetchError(f"too many redirects from {url}")


async def fetch_readable(url: str) -> tuple[str, str | None]:
    """Fetch a URL and return (clean text, title).

    Raises ``FetchError`` with a message suitable for showing the user.
    """
    settings = get_settings()

    try:
        async with httpx.AsyncClient(
            timeout=settings.fetch_timeout_seconds,
            # Never automatic — see _get_following_redirects.
            follow_redirects=False,
            headers={
                # Some publishers serve a block page to unknown agents.
                "User-Agent": (
                    "Mozilla/5.0 (compatible; KnowledgeCompiler/0.1; +https://localhost)"
                ),
                "Accept": "text/html,application/xhtml+xml",
            },
        ) as client:
            response = await _get_following_redirects(
                client, url, max_redirects=settings.fetch_max_redirects
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise FetchError(f"{url} returned {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise FetchError(f"could not fetch {url}: {exc}") from exc

    html = response.text
    extracted = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=True,
        favor_precision=True,
    )

    if not extracted or len(extracted.strip()) < 80:
        raise FetchError(
            f"could not extract readable text from {url} — the page may be "
            "JavaScript-rendered or paywalled. Try pasting the text instead."
        )

    title: str | None = None
    metadata = trafilatura.extract_metadata(html)
    if metadata and metadata.title:
        title = metadata.title.strip()

    return normalize_content(extracted), title


#: A heading longer than this is almost certainly a heading glued to its body.
MAX_HEADING_CHARS = 120
#: Where to cut such a line so the result still reads as a title.
TITLE_TARGET_CHARS = 90


def _tidy_heading(line: str) -> str:
    """Turn a candidate line into something that reads as a title.

    Pasted articles frequently have no blank line between the headline and the
    first paragraph, so the "first substantial line" is the headline with the
    opening sentences run onto it — which then renders as a wall of text where a
    title belongs. Cut it back to something title-shaped.
    """
    if len(line) <= MAX_HEADING_CHARS:
        return line

    # Prefer a real sentence boundary if one falls in a sensible place.
    for terminator in (". ", "? ", "! "):
        cut = line.find(terminator)
        if 20 <= cut <= MAX_HEADING_CHARS:
            return line[:cut].strip()

    # Otherwise cut on a word boundary rather than mid-word.
    trimmed = line[:TITLE_TARGET_CHARS]
    space = trimmed.rfind(" ")
    if space >= 20:
        trimmed = trimmed[:space]
    return trimmed.strip().rstrip(",;:-") + "…"


def derive_title(explicit: str | None, content: str, source_url: str | None) -> str:
    """Best available title, falling back through content then URL."""
    if explicit and explicit.strip():
        return _tidy_heading(explicit.strip())[:200]

    for line in content.split("\n"):
        candidate = line.strip().lstrip("#").strip()
        if len(candidate) >= 12:
            return _tidy_heading(candidate)[:200]

    if source_url:
        parsed = urlparse(source_url)
        tail = (parsed.path or "").rstrip("/").split("/")[-1]
        if tail:
            return tail.replace("-", " ").replace("_", " ")[:200]
        return parsed.netloc

    return "Untitled note"
