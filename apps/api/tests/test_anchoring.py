"""Resolving model-supplied quotes to spans in the source.

Regression cover for a v1 defect: `claim_sources.char_start`/`char_end` existed
in the schema but were never populated for new claims, so provenance was a quote
string with nothing tying it to a position in the document.
"""

from __future__ import annotations

import pytest

from app.services.anchoring import MIN_QUOTE_CHARS, locate_quote, snap_to_words

SOURCE = (
    "Retrieval-augmented generation sits firmly at query time. "
    "Each question triggers a fresh search over a document store, and the model sees only the "
    "chunks that search returned. A compiled knowledge base moves that work forward — the "
    "synthesis happens once, when a document arrives.\n\n"
    'Karpathy calls this "compile once" rather than retrieving per query; he is explicit that '
    "it is a workflow pattern, not a product."
)


class TestExactMatch:
    def test_finds_a_verbatim_quote(self):
        anchor = locate_quote(SOURCE, "Each question triggers a fresh search")
        assert anchor is not None
        assert anchor.exact is True
        assert anchor.score == 100.0

    def test_offsets_round_trip_to_the_original_text(self):
        quote = "the synthesis happens once, when a document arrives"
        anchor = locate_quote(SOURCE, quote)
        assert anchor is not None
        # The whole point of storing offsets: slicing the source must return the quote.
        assert SOURCE[anchor.start : anchor.end] == quote

    def test_finds_a_quote_at_the_very_start(self):
        anchor = locate_quote(SOURCE, "Retrieval-augmented generation sits")
        assert anchor is not None
        assert anchor.start == 0


class TestNormalisation:
    """Models 'quote verbatim' but silently normalise punctuation and whitespace."""

    def test_straightened_curly_quotes_still_match(self):
        curly = 'Karpathy calls this “compile once” rather than retrieving'
        source = SOURCE.replace('"compile once"', "“compile once”")
        anchor = locate_quote(source, curly.replace("“", '"').replace("”", '"'))
        assert anchor is not None
        assert anchor.exact is False
        assert "compile once" in source[anchor.start : anchor.end]

    def test_collapsed_whitespace_still_matches(self):
        anchor = locate_quote(SOURCE, "A compiled knowledge   base moves that work forward")
        assert anchor is not None

    def test_em_dash_substituted_for_hyphen_still_matches(self):
        anchor = locate_quote(SOURCE, "moves that work forward - the synthesis happens once")
        assert anchor is not None


class TestRejection:
    """Refusing to anchor is correct when the evidence is not there."""

    def test_rejects_an_invented_quote(self):
        # A model that hallucinates a quote must not have it attached to
        # unrelated text — that would fabricate provenance, which is worse than
        # having none.
        assert locate_quote(SOURCE, "the treaty was signed in Vienna in eighteen fifteen") is None

    def test_rejects_a_quote_too_short_to_be_evidence(self):
        assert locate_quote(SOURCE, "the model") is None

    @pytest.mark.parametrize("quote", ["", "   ", None])
    def test_rejects_empty_quotes(self, quote):
        assert locate_quote(SOURCE, quote) is None

    def test_rejects_against_an_empty_source(self):
        assert locate_quote("", "Each question triggers a fresh search") is None

    def test_min_quote_length_is_enforced_at_the_boundary(self):
        filler = "z" * (MIN_QUOTE_CHARS - 1)
        assert locate_quote(filler + " tail", filler) is None


class TestOffsetsAreWithinBounds:
    """A bad offset would raise or silently mis-highlight in the UI."""

    @pytest.mark.parametrize(
        "quote",
        [
            "Retrieval-augmented generation sits firmly at query time",
            "chunks that search returned",
            "it is a workflow pattern, not a product",
        ],
    )
    def test_span_stays_inside_the_source(self, quote):
        anchor = locate_quote(SOURCE, quote)
        assert anchor is not None
        assert 0 <= anchor.start < anchor.end <= len(SOURCE)


class TestWordBoundarySnapping:
    """A fuzzy match lands where the alignment scored best, often mid-word.

    Rendering that raw produces a highlight starting at "ex structures" instead of
    "index structures", which reads as a rendering bug rather than a citation.
    """

    def test_widens_a_mid_word_span_outward(self):
        source = "index structures involved trade recall for latency here"
        # Deliberately ragged on both ends.
        start, end = snap_to_words(source, source.index("dex"), source.index("latenc") + 6)
        assert source[start:end] == "index structures involved trade recall for latency"

    def test_never_narrows_a_clean_span(self):
        source = "alpha beta gamma"
        assert snap_to_words(source, 6, 10) == (6, 10)

    def test_is_bounded_inside_one_long_token(self):
        source = "x" * 500
        start, end = snap_to_words(source, 200, 210)
        # Without a bound this would crawl to the ends of the document.
        assert start >= 200 - 24 and end <= 210 + 24

    def test_handles_span_at_the_document_edges(self):
        source = "first middle last"
        assert snap_to_words(source, 0, 3)[0] == 0
        assert snap_to_words(source, 13, len(source))[1] == len(source)

    def test_fuzzy_anchor_lands_on_word_boundaries(self):
        source = "Index structures involved trade recall for latency in every corpus."
        anchor = locate_quote(source, "index structures that trade recall for latency")
        assert anchor is not None
        span = source[anchor.start : anchor.end]
        assert not span[0].isspace() and span[0].isalnum()
        # The span must begin and end on real word edges.
        assert span.split()[0] in source.split()
