"""Splitting long documents for the compile window.

The failure this prevents is silent: the agent sends at most 24k characters to
the model, so a book stored as one item compiles from its opening pages while the
rest disappears — and the compile still succeeds, and the page still looks
plausible. Nothing surfaces the loss. Hence the emphasis here on "no character is
dropped" rather than on chunk sizes.
"""

from __future__ import annotations

import pytest

from app.services.chunking import (
    DEFAULT_CHUNK_CHARS,
    DEFAULT_OVERLAP_CHARS,
    MIN_TAIL_CHARS,
    Chunk,
    chunk_text,
    chunk_title,
)

PARAGRAPH = "Embeddings place related passages near each other in vector space. " * 8


def build(paragraphs: int) -> str:
    return "\n\n".join(f"{PARAGRAPH}({i})" for i in range(paragraphs))


class TestShortDocuments:
    def test_a_short_document_is_one_chunk(self):
        chunks = chunk_text("A short note.")
        assert len(chunks) == 1
        assert chunks[0].total == 1

    def test_empty_input_yields_nothing(self):
        assert chunk_text("   \n\n  ") == []

    def test_a_document_exactly_at_the_limit_is_not_split(self):
        assert len(chunk_text("x" * DEFAULT_CHUNK_CHARS)) == 1


class TestNothingIsLost:
    """The property that matters. Everything else is presentation."""

    @pytest.mark.parametrize("paragraphs", [20, 60, 200])
    def test_every_character_survives(self, paragraphs):
        text = build(paragraphs)
        chunks = chunk_text(text)
        # Overlap means the concatenation is longer than the source, never shorter.
        assert sum(len(c.text) for c in chunks) >= len(text.strip())

    def test_the_tail_of_a_long_document_is_present(self):
        text = build(80) + "\n\nTHE FINAL DISTINCTIVE SENTENCE APPEARS HERE."
        chunks = chunk_text(text)
        assert len(chunks) > 1
        assert any("FINAL DISTINCTIVE SENTENCE" in c.text for c in chunks)

    def test_the_opening_is_present(self):
        text = "DISTINCTIVE OPENING LINE.\n\n" + build(80)
        assert "DISTINCTIVE OPENING" in chunk_text(text)[0].text


class TestChunkSizing:
    def test_no_chunk_greatly_exceeds_the_limit(self):
        # Overlap is added to the front of later chunks, so the ceiling is
        # limit + overlap, not limit.
        ceiling = DEFAULT_CHUNK_CHARS + DEFAULT_OVERLAP_CHARS
        assert all(len(c.text) <= ceiling for c in chunk_text(build(200)))

    def test_a_runt_tail_is_folded_into_its_predecessor(self):
        # A 200-character final chunk would compile into a near-empty page.
        text = build(60) + "\n\n" + "tiny tail."
        chunks = chunk_text(text)
        assert all(len(c.text) >= MIN_TAIL_CHARS for c in chunks[1:])

    def test_indices_are_sequential_and_total_is_consistent(self):
        chunks = chunk_text(build(100))
        assert [c.index for c in chunks] == list(range(len(chunks)))
        assert all(c.total == len(chunks) for c in chunks)


class TestBoundaries:
    def test_later_chunks_start_on_a_whole_word(self):
        """Not on a sentence — on a word.

        Overlap deliberately reaches back into the middle of the previous
        sentence to carry context across the seam, so a lowercase start is
        correct. What must never happen is a start inside a word: the model would
        be handed a fragment, and a quote drawn from it could not be anchored back
        to the source.
        """
        text = build(120)
        vocabulary = set(text.split())
        for chunk in chunk_text(text)[1:]:
            assert chunk.text.split()[0] in vocabulary

    def test_does_not_cut_mid_word_without_a_boundary(self):
        # One enormous unbroken token: no paragraph, sentence, or space to use.
        chunks = chunk_text("x" * (DEFAULT_CHUNK_CHARS * 2))
        assert len(chunks) >= 2
        assert sum(len(c.text) for c in chunks) >= DEFAULT_CHUNK_CHARS * 2


class TestTitles:
    def test_a_single_chunk_keeps_its_plain_title(self):
        # "(part 1 of 1)" on every ordinary save would be noise.
        assert chunk_title("My Note", Chunk(index=0, total=1, text="x")) == "My Note"

    def test_multi_part_titles_are_numbered_for_the_feed(self):
        assert chunk_title("Book", Chunk(index=2, total=5, text="x")) == "Book (part 3 of 5)"
