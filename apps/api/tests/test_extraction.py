"""Content normalization, hashing, slugs, and SSRF guards."""

from __future__ import annotations

import pytest

from app.services.extraction import (
    FetchError,
    _assert_public_url,
    content_hash,
    derive_title,
    normalize_content,
    slugify,
)


class TestNormalizeContent:
    def test_collapses_runs_of_spaces(self):
        assert normalize_content("a    b") == "a b"

    def test_collapses_three_or_more_newlines_to_two(self):
        assert normalize_content("a\n\n\n\nb") == "a\n\nb"

    def test_normalizes_windows_line_endings(self):
        assert normalize_content("a\r\nb") == "a\nb"

    def test_strips_trailing_whitespace_per_line(self):
        assert normalize_content("a   \n   b") == "a\nb"


class TestContentHash:
    def test_ignores_incidental_whitespace_differences(self):
        # Re-saving the same article after a reflow must not create a second item.
        assert content_hash("The cat\n\n\nsat  down") == content_hash("The cat\n\nsat down")

    def test_differs_for_different_content(self):
        assert content_hash("first passage") != content_hash("second passage")

    def test_is_stable_across_calls(self):
        assert content_hash("stable") == content_hash("stable")


class TestSlugify:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("LLM Knowledge Bases", "llm-knowledge-bases"),
            ("Karpathy's  Wiki!", "karpathy-s-wiki"),
            ("Café Périphérique", "cafe-peripherique"),
            ("---leading and trailing---", "leading-and-trailing"),
        ],
    )
    def test_produces_url_safe_slugs(self, value, expected):
        assert slugify(value) == expected

    def test_falls_back_when_nothing_survives(self):
        assert slugify("!!!", fallback="untitled") == "untitled"

    def test_caps_length(self):
        assert len(slugify("word " * 100)) <= 80


class TestDeriveTitle:
    def test_prefers_explicit_title(self):
        assert derive_title("Explicit", "Body text here", None) == "Explicit"

    def test_falls_back_to_first_substantial_line(self):
        assert derive_title(None, "# A Heading Long Enough\nbody", None) == "A Heading Long Enough"

    def test_skips_short_lines(self):
        assert derive_title(None, "ok\nA Real Heading Here\n", None) == "A Real Heading Here"

    def test_falls_back_to_url_slug(self):
        title = derive_title(None, "tiny", "https://example.com/some-article-name")
        assert title == "some article name"

    def test_final_fallback(self):
        assert derive_title(None, "", None) == "Untitled note"


class TestPublicUrlGuard:
    """Saved links are fetched by the server, so private targets must be refused."""

    @pytest.mark.parametrize(
        "url",
        [
            "http://localhost:8000/health",
            "http://127.0.0.1/admin",
            "http://169.254.169.254/latest/meta-data/",  # cloud metadata
            "http://[::1]/",
        ],
    )
    def test_rejects_non_public_addresses(self, url):
        with pytest.raises(FetchError):
            _assert_public_url(url)

    @pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.com", "gopher://x"])
    def test_rejects_non_http_schemes(self, url):
        with pytest.raises(FetchError):
            _assert_public_url(url)

    def test_rejects_unresolvable_host(self):
        with pytest.raises(FetchError):
            _assert_public_url("https://this-host-does-not-exist.invalid/x")


class TestHeadingTidying:
    """Pasted articles often have no blank line between headline and body.

    The first substantial line is then the headline with the opening sentences
    run onto it, which renders as a wall of text where a title belongs.
    """

    def test_leaves_a_normal_headline_alone(self):
        assert derive_title(None, "A Perfectly Normal Headline", None) == (
            "A Perfectly Normal Headline"
        )

    def test_cuts_a_headline_glued_to_its_body(self):
        glued = (
            "Siklus Hidup Lengkap Pengembangan Large Language Model: Dari Arsitektur "
            "Fondasional hingga Implikasi EtisPendahuluanLarge Language Models telah muncul "
            "sebagai salah satu teknologi paling transformatif dekade ini."
        )
        title = derive_title(None, glued, None)
        assert len(title) < 100
        assert title.endswith("…")
        assert "Pendahuluan" not in title

    def test_prefers_a_sentence_boundary_when_one_fits(self):
        assert derive_title(
            None, "Vector indexes explained. They trade recall for speed.", None
        ).startswith("Vector indexes explained")

    def test_never_cuts_mid_word(self):
        title = derive_title(None, "word " * 60, None)
        assert not title.rstrip("…").endswith("wor")

    def test_applies_to_an_explicit_title_too(self):
        # The extension and save-by-link both supply titles that can be just as long.
        assert len(derive_title("x " * 200, "body", None)) < 200
