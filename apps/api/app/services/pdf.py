"""PDF text extraction with page-level provenance.

Uses **pypdfium2** (BSD-3/Apache-2.0, PDFium — Chrome's PDF engine), deliberately
not PyMuPDF. PyMuPDF is dual-licensed AGPL-3.0 or commercial: the AGPL is the
network-copyleft variant, so serving a hosted product from it triggers source
disclosure, and the commercial licence is reported in the $10k–50k/yr range.
`pymupdf4llm` inherits the same licence and depends on pymupdf, so it is not an
escape. pypdfium2 also happens to be roughly a thousand times faster per page
than the ML-based extractors (docling, marker), which matters for a 300-page book.

`pikepdf` (MPL-2.0) validates the file before PDFium touches it, so a corrupt or
hostile upload fails with a clear message rather than inside the render engine.

Every page records its span in the combined text, which is what lets a claim's
character offsets be translated back into "page 42" for the reader.
"""

from __future__ import annotations

import io
from bisect import bisect_right
from dataclasses import dataclass, field

import structlog

log = structlog.get_logger(__name__)

#: Pages are joined by a blank line so the model reads them as separate blocks.
PAGE_SEPARATOR = "\n\n"

#: Below this many characters per page, the document is almost certainly scanned
#: images with no text layer — extraction would return nothing useful.
SCANNED_CHARS_PER_PAGE = 40

#: Refuse absurd page counts rather than spend minutes rendering a zip bomb.
MAX_PAGES = 2000


class PdfError(RuntimeError):
    """The file is not a usable PDF. Message is safe to show the user."""


@dataclass(frozen=True)
class PageSpan:
    """Where one page's text sits inside the combined document text."""

    page_no: int  # 1-based, matching what the reader sees in a viewer
    start: int  # inclusive offset into the combined text
    end: int  # exclusive


@dataclass
class ExtractedPdf:
    text: str
    pages: list[PageSpan] = field(default_factory=list)
    page_count: int = 0
    is_scanned: bool = False
    title: str | None = None

    def page_for_offset(self, offset: int) -> int | None:
        """Which page a character offset falls on.

        Binary search rather than a scan, because this runs once per claim on a
        document that may have hundreds of pages.
        """
        if not self.pages:
            return None
        starts = [p.start for p in self.pages]
        index = bisect_right(starts, offset) - 1
        if index < 0:
            return None
        page = self.pages[index]
        return page.page_no if offset < page.end else None


def _validate(data: bytes) -> None:
    """Reject anything that is not a well-formed PDF before rendering it."""
    if not data:
        raise PdfError("the uploaded file is empty")
    if not data.startswith(b"%PDF-"):
        raise PdfError("that does not look like a PDF file")

    try:
        import pikepdf

        with pikepdf.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) == 0:
                raise PdfError("this PDF has no pages")
            if len(pdf.pages) > MAX_PAGES:
                raise PdfError(f"this PDF has more than {MAX_PAGES} pages")
    except PdfError:
        raise
    except Exception as exc:
        # pikepdf raises a family of errors whose text includes buffer reprs and
        # object addresses. Those help nobody reading a toast, so the cause is
        # mapped to something actionable and the original is logged instead.
        message = str(exc).lower()
        log.info("pdf_rejected", error=str(exc)[:200])

        if "password" in message or "encrypt" in message:
            raise PdfError("this PDF is password-protected") from exc
        if "trailer" in message or "damaged" in message or "recover" in message:
            raise PdfError("this PDF appears to be corrupt or incomplete") from exc
        raise PdfError("could not open this PDF") from exc


def _page_text(page) -> str:
    """Text of one page.

    PDFium's text API counts UTF-16 code units, so an astral-plane character
    (emoji, rare CJK) is two indices there but one Python character. Reading the
    whole range at once and letting pypdfium2 decode it avoids having to reconcile
    the two numbering schemes.
    """
    textpage = page.get_textpage()
    try:
        return textpage.get_text_range()
    finally:
        textpage.close()


def extract_pdf(data: bytes) -> ExtractedPdf:
    """Extract text from a PDF, recording where each page begins and ends.

    Raises ``PdfError`` with a message suitable for showing the user.
    """
    _validate(data)

    import pypdfium2 as pdfium

    from app.services.extraction import normalize_content

    try:
        document = pdfium.PdfDocument(io.BytesIO(data))
    except Exception as exc:
        raise PdfError(f"could not read this PDF: {exc}") from exc

    parts: list[str] = []
    spans: list[PageSpan] = []
    offset = 0

    try:
        page_count = len(document)
        for index in range(page_count):
            page = document[index]
            try:
                raw = _page_text(page) or ""
            except Exception as exc:
                # One unreadable page should not lose the other 299.
                log.warning("pdf_page_unreadable", page=index + 1, error=str(exc))
                raw = ""
            finally:
                page.close()

            cleaned = normalize_content(raw)
            if not cleaned:
                continue

            spans.append(PageSpan(page_no=index + 1, start=offset, end=offset + len(cleaned)))
            parts.append(cleaned)
            offset += len(cleaned) + len(PAGE_SEPARATOR)

        title = None
        try:
            meta = document.get_metadata_dict()
            title = (meta.get("Title") or "").strip() or None
        except Exception:
            title = None
    finally:
        document.close()

    text = PAGE_SEPARATOR.join(parts)
    is_scanned = page_count > 0 and len(text) < SCANNED_CHARS_PER_PAGE * page_count

    if not text.strip():
        raise PdfError(
            "no text could be extracted — this PDF is probably a scan of images. "
            "OCR is not enabled, so paste the text instead."
        )

    return ExtractedPdf(
        text=text,
        pages=spans,
        page_count=page_count,
        is_scanned=is_scanned,
        title=title,
    )
