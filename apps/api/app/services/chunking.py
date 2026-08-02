"""Splitting long documents so nothing is lost past the compile window.

The agent sends at most 24k characters to the model. A 300-page book stored as
one item would therefore be compiled from its first few pages and the rest would
vanish silently — the same class of bug as the excerpt truncation fixed earlier,
and just as invisible, because the compile still succeeds and the resulting page
still looks plausible.

So a long document becomes several items, each its own compile. They land on the
same topic and merge, which is exactly what the pipeline is for.

Splits fall on paragraph boundaries wherever possible: cutting mid-sentence
strands a claim's supporting quote across two chunks, and the quote is what makes
provenance work.
"""

from __future__ import annotations

from dataclasses import dataclass

#: Comfortably under the agent's 24k cap, leaving room for the prompt scaffolding
#: (title, source line, instructions) that is sent alongside the content.
DEFAULT_CHUNK_CHARS = 18_000

#: Carried from the end of one chunk into the start of the next, so a paragraph
#: spanning a boundary is fully visible to at least one compile.
DEFAULT_OVERLAP_CHARS = 800

#: A trailing fragment smaller than this is folded into the previous chunk rather
#: than compiled on its own — a 200-character chunk produces a near-empty page.
MIN_TAIL_CHARS = 1_500


@dataclass(frozen=True)
class Chunk:
    index: int  # 0-based
    total: int
    text: str


def _split_points(text: str, limit: int) -> list[int]:
    """Offsets to cut at, preferring paragraph then sentence boundaries."""
    points: list[int] = []
    position = 0

    while len(text) - position > limit:
        window_end = position + limit
        # Search backwards from the limit for the cleanest boundary available.
        for separator in ("\n\n", "\n", ". "):
            found = text.rfind(separator, position + limit // 2, window_end)
            if found != -1:
                points.append(found + len(separator))
                position = points[-1]
                break
        else:
            # No boundary in the back half of the window — cut on a space rather
            # than mid-word, and only fall back to a hard cut if there is none.
            space = text.rfind(" ", position + limit // 2, window_end)
            points.append(space + 1 if space != -1 else window_end)
            position = points[-1]

    return points


def _snap_forward(text: str, position: int, *, window: int = 40) -> int:
    """Move an offset forward to the next word start, within a bounded window.

    Bounded so that a position inside a very long unbroken token advances a
    little rather than skipping to the end of it.
    """
    limit = min(len(text), position + window)
    while position < limit and not text[position].isspace():
        position += 1
    while position < limit and text[position].isspace():
        position += 1
    return position


def chunk_text(
    text: str,
    *,
    limit: int = DEFAULT_CHUNK_CHARS,
    overlap: int = DEFAULT_OVERLAP_CHARS,
) -> list[Chunk]:
    """Split `text` into compile-sized pieces.

    Returns a single chunk when the text already fits, so callers do not need to
    special-case short documents.
    """
    text = text.strip()
    if not text:
        return []
    if len(text) <= limit:
        return [Chunk(index=0, total=1, text=text)]

    cuts = _split_points(text, limit)
    bounds = [0, *cuts, len(text)]

    # Fold a runt tail into its predecessor: a 200-character final chunk compiles
    # into a near-empty page. Only when the merged result still fits, otherwise
    # the fold would push one chunk past the model's window — the exact loss this
    # module exists to prevent.
    if (
        len(bounds) >= 3
        and bounds[-1] - bounds[-2] < MIN_TAIL_CHARS
        and bounds[-1] - bounds[-3] <= limit
    ):
        bounds.pop(-2)

    pieces: list[str] = []
    for i in range(len(bounds) - 1):
        start, end = bounds[i], bounds[i + 1]
        if i > 0:
            # Overlap reaches backwards, never forwards, so no character is
            # dropped even where the boundary search picked an awkward spot.
            # Snapped forward to a word boundary: starting mid-word hands the
            # model a fragment and makes a quote unmatchable against the source.
            start = _snap_forward(text, max(0, start - overlap))
        piece = text[start:end].strip()
        if piece:
            pieces.append(piece)

    return [Chunk(index=i, total=len(pieces), text=piece) for i, piece in enumerate(pieces)]


def chunk_title(title: str, chunk: Chunk) -> str:
    """Label a chunk so the activity feed shows which part is compiling.

    Single-chunk documents keep their plain title — a "(part 1 of 1)" suffix on
    every ordinary save would be noise.
    """
    if chunk.total <= 1:
        return title
    return f"{title} (part {chunk.index + 1} of {chunk.total})"
