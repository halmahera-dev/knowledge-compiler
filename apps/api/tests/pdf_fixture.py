"""Builds a real PDF, by hand, for tests.

Written as raw PDF syntax rather than through a generator library so the test
suite gains no dependency and the fixture is deterministic — byte-identical every
run, which matters because content hashing drives deduplication.
"""

from __future__ import annotations


def build_pdf(pages: list[list[str]]) -> bytes:
    """A minimal PDF with a Helvetica text layer.

    `pages` is a list of pages, each a list of lines.
    """
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)  # object numbers are 1-based

    font_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    content_ids: list[int] = []
    for lines in pages:
        parts = [b"BT", b"/F1 11 Tf", b"40 780 Td", b"14 TL"]
        for line in lines:
            escaped = (
                line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
            ).encode("latin-1", "replace")
            parts.append(b"(" + escaped + b") Tj T*")
        parts.append(b"ET")
        stream = b"\n".join(parts)
        content_ids.append(
            add(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        )

    # Page objects need the Pages id, which needs the page ids — so the parent is
    # reserved first and filled in below.
    pages_id = add(b"PLACEHOLDER")
    page_ids = [
        add(
            b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
            % (pages_id, font_id, content_id)
        )
        for content_id in content_ids
    ]
    kids = b" ".join(b"%d 0 R" % pid for pid in page_ids)
    objects[pages_id - 1] = b"<< /Type /Pages /Count %d /Kids [%s] >>" % (
        len(page_ids),
        kids,
    )
    root_id = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)

    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"

    xref_at = len(out)
    out += b"xref\n0 %d\n" % (len(objects) + 1)
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        root_id,
        xref_at,
    )
    return bytes(out)


#: A three-page document whose last page carries a distinctive phrase, so a test
#: can prove the tail of a document survives extraction.
SAMPLE_PAGES = [
    [
        "Post-training quantisation reduces the numeric precision of weights",
        "after training is complete, most commonly from sixteen-bit floats",
        "down to eight or four bits per parameter.",
    ],
    [
        "The appeal is memory. A seven-billion parameter model needing",
        "fourteen gigabytes at half precision fits in under four at four-bit",
        "precision, which decides whether it runs on a laptop.",
    ],
    [
        "The cost is accuracy, and it is not evenly distributed.",
        "ZANZIBAR OUTLIER CHANNELS dominate the quantisation error,",
        "which is why naive uniform quantisation degrades sharply.",
    ],
]
