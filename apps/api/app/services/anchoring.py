"""Resolving a model-supplied quote back to a span in its source document.

The compile pipeline asks the extractor for a verbatim quote supporting every
claim. What it must NOT do is ask the model for character offsets — a model
cannot count characters, so it will emit plausible-looking numbers that point at
the wrong text, which is worse than having no offsets at all. Offsets are
therefore resolved here, deterministically, against the stored source.

Exact match is tried first and covers the common case for free. The fuzzy path
exists because models normalise whitespace, straighten curly quotes, and elide
with an ellipsis even when instructed to copy exactly; discarding provenance for
a quote that is demonstrably present in the source would be the wrong trade.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from rapidfuzz import fuzz

#: Below this partial-ratio score the match is not trustworthy enough to record.
#: Tuned so that a quote with normalised punctuation and whitespace still lands,
#: while a quote the model invented does not attach itself to unrelated text.
MIN_SCORE = 82.0

#: Quotes shorter than this match too easily by chance to be useful evidence.
MIN_QUOTE_CHARS = 12

_WS_RE = re.compile(r"\s+")

# Characters models routinely substitute when "quoting verbatim".
_LOOKALIKES = {
    "‘": "'",
    "’": "'",
    "‚": "'",
    "“": '"',
    "”": '"',
    "„": '"',
    "–": "-",
    "—": "-",
    "−": "-",
    " ": " ",
    "…": "...",
}


@dataclass(frozen=True)
class Anchor:
    """Where a quote was found, and how confident we are that it is really there."""

    start: int
    end: int
    score: float
    exact: bool


def _fold(text: str) -> str:
    """Normalise the punctuation and whitespace differences models introduce."""
    text = unicodedata.normalize("NFKC", text)
    for source, replacement in _LOOKALIKES.items():
        text = text.replace(source, replacement)
    return text


def _fold_with_map(text: str) -> tuple[str, list[int]]:
    """Fold `text`, returning the folded string and a per-character index back to the original.

    The index map is what makes the result usable: folding can change string
    length (an ellipsis becomes three dots), so an offset found in folded space
    would be wrong in the original without translating it back.
    """
    folded_chars: list[str] = []
    index_map: list[int] = []

    for position, char in enumerate(text):
        replacement = _LOOKALIKES.get(char)
        piece = replacement if replacement is not None else unicodedata.normalize("NFKC", char)
        for folded_char in piece:
            folded_chars.append(folded_char)
            index_map.append(position)

    return "".join(folded_chars), index_map


def locate_quote(source: str, quote: str, *, min_score: float = MIN_SCORE) -> Anchor | None:
    """Find `quote` in `source`, returning offsets into the ORIGINAL source.

    Returns None when the quote is too short to be evidence, or when no region of
    the source resembles it closely enough. A caller that gets None should store
    the quote without offsets rather than guessing.
    """
    quote = (quote or "").strip()
    if len(quote) < MIN_QUOTE_CHARS or not source:
        return None

    # Fast path: the model did as it was told.
    exact_at = source.find(quote)
    if exact_at != -1:
        return Anchor(start=exact_at, end=exact_at + len(quote), score=100.0, exact=True)

    folded_source, index_map = _fold_with_map(source)
    folded_quote = _WS_RE.sub(" ", _fold(quote))

    # Try again exactly, now that punctuation lookalikes are reconciled.
    folded_at = folded_source.find(folded_quote)
    if folded_at != -1:
        return Anchor(
            start=index_map[folded_at],
            end=_original_end(index_map, folded_at + len(folded_quote), len(source)),
            score=99.0,
            exact=False,
        )

    alignment = fuzz.partial_ratio_alignment(
        folded_quote, folded_source, score_cutoff=min_score
    )
    if alignment is None:
        return None

    # Only the fuzzy path needs snapping — the exact paths land on real boundaries
    # by construction, since they matched the quote's own edges.
    start, end = snap_to_words(
        source,
        index_map[alignment.dest_start],
        _original_end(index_map, alignment.dest_end, len(source)),
    )
    return Anchor(start=start, end=end, score=float(alignment.score), exact=False)


def _original_end(index_map: list[int], folded_end: int, source_len: int) -> int:
    """Translate an exclusive end offset out of folded space.

    The last folded character maps to some original character; the exclusive end
    is one past it.
    """
    if folded_end <= 0:
        return 0
    if folded_end > len(index_map):
        return source_len
    return min(source_len, index_map[folded_end - 1] + 1)


#: How far to look for a word boundary before giving up and keeping the raw span.
_SNAP_WINDOW = 24


def snap_to_words(source: str, start: int, end: int) -> tuple[int, int]:
    """Widen a span outward to the nearest word boundaries.

    A fuzzy match lands wherever the alignment scored best, which is regularly
    mid-word — a highlight rendered from a raw span begins at "ex structures"
    instead of "index structures" and reads as a rendering bug. Widening (never
    narrowing) keeps the quoted evidence intact while making the span presentable.

    The search is bounded so a span inside a long unbroken token cannot crawl
    across the whole document.
    """
    if not source:
        return start, end

    start = max(0, min(start, len(source)))
    end = max(start, min(end, len(source)))

    limit = max(0, start - _SNAP_WINDOW)
    while start > limit and not source[start - 1].isspace():
        start -= 1

    limit = min(len(source), end + _SNAP_WINDOW)
    while end < limit and not source[end].isspace():
        end += 1

    return start, end
