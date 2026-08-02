"""PDF ingestion.

Covers the two things that would silently corrupt the knowledge base: losing the
tail of a long document, and mapping a claim's offset to the wrong page.
"""

from __future__ import annotations

import pytest

from app.services.pdf import PdfError, extract_pdf

from .pdf_fixture import SAMPLE_PAGES, build_pdf


@pytest.fixture(scope="module")
def sample() -> bytes:
    return build_pdf(SAMPLE_PAGES)


class TestExtraction:
    def test_reads_every_page(self, sample):
        assert extract_pdf(sample).page_count == 3

    def test_records_a_span_per_page(self, sample):
        assert len(extract_pdf(sample).pages) == 3

    def test_the_tail_of_the_document_survives(self, sample):
        # The failure this guards: extracting only the first page while the
        # compile still succeeds, so nothing looks wrong.
        assert "ZANZIBAR" in extract_pdf(sample).text

    def test_spans_are_contiguous_and_ordered(self, sample):
        pages = extract_pdf(sample).pages
        assert [p.page_no for p in pages] == [1, 2, 3]
        # Pairwise over consecutive spans, so the tail is intentionally shorter.
        for earlier, later in zip(pages, pages[1:], strict=False):
            assert earlier.end <= later.start

    def test_a_text_pdf_is_not_flagged_as_scanned(self, sample):
        assert extract_pdf(sample).is_scanned is False


class TestPageProvenance:
    """A claim's character offset has to resolve to the page a reader can open."""

    def test_maps_an_offset_to_its_page(self, sample):
        extracted = extract_pdf(sample)
        offset = extracted.text.find("ZANZIBAR")
        assert offset > 0
        assert extracted.page_for_offset(offset) == 3

    def test_maps_the_opening_to_page_one(self, sample):
        assert extract_pdf(sample).page_for_offset(0) == 1

    def test_an_offset_past_the_end_has_no_page(self, sample):
        extracted = extract_pdf(sample)
        assert extracted.page_for_offset(len(extracted.text) + 500) is None

    def test_every_page_boundary_resolves_to_that_page(self, sample):
        extracted = extract_pdf(sample)
        for span in extracted.pages:
            assert extracted.page_for_offset(span.start) == span.page_no
            assert extracted.page_for_offset(span.end - 1) == span.page_no


class TestRejection:
    """Every message here is shown to a user, so none may leak internals."""

    @pytest.mark.parametrize(
        ("blob", "expected"),
        [
            (b"", "empty"),
            (b"just some text", "does not look like a PDF"),
            (b"%PDF-1.4 truncated garbage", "corrupt or incomplete"),
        ],
    )
    def test_rejects_bad_input_readably(self, blob, expected):
        with pytest.raises(PdfError, match=expected):
            extract_pdf(blob)

    def test_rejects_a_pdf_with_no_text_layer(self):
        # A scan of images extracts nothing; the user is told to paste instead
        # rather than getting an empty page.
        with pytest.raises(PdfError, match="no text could be extracted"):
            extract_pdf(build_pdf([[], []]))

    def test_error_messages_carry_no_object_reprs(self):
        # pikepdf's own text includes buffer addresses; those must not surface.
        try:
            extract_pdf(b"%PDF-1.4 truncated garbage")
        except PdfError as exc:
            assert "0x" not in str(exc)
            assert "BytesIO" not in str(exc)
