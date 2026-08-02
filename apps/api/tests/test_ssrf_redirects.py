"""Redirects must not smuggle the fetcher onto a private address.

Saving a link is the one place a user hands the server an address and the server
goes and gets it, so the guard on that address is the whole of the protection.

It used to be applied twice and both times too late to matter: once before the
request, and once on the final URL *after* httpx had already followed the chain
with ``follow_redirects=True``. A page under an attacker's control answering
``302 Location: http://169.254.169.254/latest/meta-data/`` therefore got the
metadata endpoint fetched. The stored result was refused, which is not the same
thing — the request had happened, and anything that acts on a GET had acted.

These tests assert on *what was contacted*, not on what came back, because that
is the distinction the old code got wrong.
"""

from __future__ import annotations

import httpx
import pytest

from app.extraction import FetchError, _get_following_redirects


class RecordingClient:
    """Stands in for httpx.AsyncClient, logging every URL actually requested."""

    def __init__(self, responses: dict[str, httpx.Response]):
        self._responses = responses
        self.requested: list[str] = []

    async def get(self, url: str) -> httpx.Response:
        self.requested.append(url)
        try:
            return self._responses[url]
        except KeyError:  # pragma: no cover - a test wired wrong, not a code path
            raise AssertionError(f"unexpected request to {url}") from None


def redirect(to: str, status: int = 302) -> httpx.Response:
    return httpx.Response(status_code=status, headers={"location": to})


def page(body: str = "<html><body>hello</body></html>") -> httpx.Response:
    return httpx.Response(status_code=200, html=body)


PUBLIC = "https://example.com/article"
PRIVATE = "http://169.254.169.254/latest/meta-data/"


@pytest.mark.asyncio
class TestGuardedRedirects:
    async def test_a_direct_page_is_returned(self):
        client = RecordingClient({PUBLIC: page()})
        response = await _get_following_redirects(client, PUBLIC, max_redirects=5)

        assert response.status_code == 200
        assert client.requested == [PUBLIC]

    async def test_the_metadata_endpoint_is_never_contacted(self):
        # The bypass, stated as a test: the private hop must not be requested at
        # all, not merely discarded once it comes back.
        client = RecordingClient({PUBLIC: redirect(PRIVATE)})

        with pytest.raises(FetchError, match="non-public address"):
            await _get_following_redirects(client, PUBLIC, max_redirects=5)

        assert client.requested == [PUBLIC]
        assert PRIVATE not in client.requested

    async def test_a_redirect_to_loopback_is_refused_before_the_request(self):
        client = RecordingClient({PUBLIC: redirect("http://127.0.0.1:8000/internal/items")})

        with pytest.raises(FetchError, match="non-public address"):
            await _get_following_redirects(client, PUBLIC, max_redirects=5)

        assert client.requested == [PUBLIC]

    async def test_a_redirect_to_a_non_http_scheme_is_refused(self):
        client = RecordingClient({PUBLIC: redirect("file:///etc/passwd")})

        with pytest.raises(FetchError, match="unsupported URL scheme"):
            await _get_following_redirects(client, PUBLIC, max_redirects=5)

        assert client.requested == [PUBLIC]

    async def test_a_public_redirect_is_followed(self):
        final = "https://example.org/moved"
        client = RecordingClient({PUBLIC: redirect(final), final: page()})

        response = await _get_following_redirects(client, PUBLIC, max_redirects=5)

        assert response.status_code == 200
        assert client.requested == [PUBLIC, final]

    async def test_a_relative_location_resolves_against_the_current_url(self):
        # Location is frequently relative; treating it as absolute would either
        # fail to resolve or, worse, resolve somewhere unintended.
        target = "https://example.com/elsewhere"
        client = RecordingClient({PUBLIC: redirect("/elsewhere"), target: page()})

        await _get_following_redirects(client, PUBLIC, max_redirects=5)

        assert client.requested == [PUBLIC, target]

    async def test_the_guard_still_applies_after_several_public_hops(self):
        # A chain that looks innocent until the last step.
        one, two = "https://example.org/1", "https://example.net/2"
        client = RecordingClient(
            {PUBLIC: redirect(one), one: redirect(two), two: redirect(PRIVATE)}
        )

        with pytest.raises(FetchError, match="non-public address"):
            await _get_following_redirects(client, PUBLIC, max_redirects=5)

        assert client.requested == [PUBLIC, one, two]

    async def test_a_redirect_loop_terminates(self):
        a, b = "https://example.com/a", "https://example.com/b"
        client = RecordingClient({a: redirect(b), b: redirect(a)})

        with pytest.raises(FetchError, match="too many redirects"):
            await _get_following_redirects(client, a, max_redirects=3)

        # Bounded by max_redirects rather than running until something breaks.
        assert len(client.requested) == 4

    async def test_a_redirect_without_a_location_is_returned_as_is(self):
        # Rather than looping on a header that will never appear.
        client = RecordingClient({PUBLIC: httpx.Response(status_code=302)})

        response = await _get_following_redirects(client, PUBLIC, max_redirects=5)

        assert response.status_code == 302
        assert client.requested == [PUBLIC]

    async def test_the_initial_url_is_checked_too(self):
        client = RecordingClient({})

        with pytest.raises(FetchError, match="non-public address"):
            await _get_following_redirects(client, PRIVATE, max_redirects=5)

        assert client.requested == []
