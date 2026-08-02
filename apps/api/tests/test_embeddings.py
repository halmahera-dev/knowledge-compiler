"""Embedding provider selection, and the zero-padding the local fallback relies on."""

from __future__ import annotations

import json
import math

import pytest

from app.config import Settings
from app.embeddings import (
    CohereEmbedProvider,
    EmbeddingError,
    LocalProvider,
    build_candidates,
    build_embedding_input,
    resolve_provider,
)


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb)


class StubProvider:
    """Deterministic stand-in so provider selection is testable without network."""

    suggested_threshold = 0.75

    def __init__(self, name: str, dim: int = 1024, *, fail: bool = False, wrong_dim: bool = False):
        self.name = name
        self.dim = dim
        self.calls = 0
        self._fail = fail
        self._wrong_dim = wrong_dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls += 1
        if self._fail:
            raise RuntimeError("provider unavailable")
        width = 7 if self._wrong_dim else self.dim
        return [[0.1] * width for _ in texts]


class TestZeroPadding:
    """The local fallback uses a 384-dim model padded to the 1024-wide column.

    Appending zeros leaves the dot product and both norms unchanged, so cosine
    similarity is identical to the unpadded model — this is exact, not an
    approximation, and the tests below pin that property.
    """

    def test_padding_preserves_cosine_similarity(self):
        a = [0.3, -0.7, 0.2, 0.9]
        b = [0.1, 0.4, -0.6, 0.2]
        pad = [0.0] * 20
        assert cosine(a, b) == pytest.approx(cosine(a + pad, b + pad), abs=1e-12)

    def test_padding_preserves_identical_vectors(self):
        a = [0.5, 0.5, 0.5]
        assert cosine(a + [0.0] * 10, a + [0.0] * 10) == pytest.approx(1.0)

    def test_padding_preserves_orthogonality(self):
        a, b = [1.0, 0.0], [0.0, 1.0]
        assert cosine(a + [0.0] * 5, b + [0.0] * 5) == pytest.approx(0.0)


class TestLocalProviderPadding:
    def test_rejects_a_model_wider_than_the_column(self):
        # Silently truncating would corrupt every similarity comparison.
        provider = LocalProvider(model_name="stub", dim=4)
        stub = type("M", (), {"embed": staticmethod(lambda ts: [[0.1] * 8 for _ in ts])})
        provider._model = stub()
        with pytest.raises(EmbeddingError, match="does not fit"):
            provider._encode(["x"])

    def test_pads_a_narrower_model_up_to_the_column(self):
        provider = LocalProvider(model_name="stub", dim=6)
        stub = type("M", (), {"embed": staticmethod(lambda ts: [[0.5] * 2 for _ in ts])})
        provider._model = stub()
        assert provider._encode(["x"]) == [[0.5, 0.5, 0.0, 0.0, 0.0, 0.0]]


class TestCandidateOrdering:
    """Bedrock is preferred; local is the safety net, never the first choice."""

    def test_auto_tries_cohere_then_titan_then_local(self):
        # Cohere leads because it is the model APAC actually has — Titan is absent
        # from every APAC region. Titan stays in the chain for US deployments.
        candidates = build_candidates(
            Settings(
                openai_api_key="sk-test",
                openai_base_url="https://bedrock-mantle.ap-southeast-3.api.aws/v1",
                embedding_fallback_region="ap-southeast-1",
            )
        )
        assert [c.name for c in candidates] == [
            "bedrock:global.cohere.embed-v4:0@ap-southeast-3",
            "bedrock:global.cohere.embed-v4:0@ap-southeast-1",
            "bedrock:amazon.titan-embed-text-v2:0@ap-southeast-3",
            "bedrock:amazon.titan-embed-text-v2:0@ap-southeast-1",
            "local:BAAI/bge-small-en-v1.5",
        ]

    def test_does_not_duplicate_when_regions_match(self):
        candidates = build_candidates(
            Settings(
                openai_api_key="sk-test",
                aws_region="us-east-1",
                embedding_fallback_region="us-east-1",
            )
        )
        # One Cohere and one Titan, not two of each.
        assert sum(c.name.startswith("bedrock:") for c in candidates) == 2

    def test_skips_bedrock_without_a_key(self):
        candidates = build_candidates(Settings(openai_api_key=""))
        assert all(not c.name.startswith("bedrock:") for c in candidates)

    def test_explicit_local_offers_only_local(self):
        candidates = build_candidates(
            Settings(openai_api_key="sk-test", embedding_provider="local")
        )
        assert [c.name for c in candidates] == ["local:BAAI/bge-small-en-v1.5"]

    def test_explicit_bedrock_offers_no_local_fallback(self):
        candidates = build_candidates(
            Settings(openai_api_key="sk-test", embedding_provider="bedrock")
        )
        assert all(c.name.startswith("bedrock:") for c in candidates)


class TestCohereResponseParsing:
    """Cohere v4 nests vectors under an embedding type; older revisions did not."""

    def _provider(self, payload: dict):
        provider = CohereEmbedProvider(
            region="ap-southeast-3", token="t", model_id="global.cohere.embed-v4:0", dim=4
        )
        body = type("B", (), {"read": staticmethod(lambda: json.dumps(payload).encode())})()
        provider._client = type(
            "C", (), {"invoke_model": staticmethod(lambda **_: {"body": body})}
        )()
        return provider

    def test_parses_the_v4_nested_shape(self):
        provider = self._provider({"embeddings": {"float": [[0.1, 0.2, 0.3, 0.4]]}})
        assert provider._invoke(["x"]) == [[0.1, 0.2, 0.3, 0.4]]

    def test_parses_a_bare_list_shape(self):
        provider = self._provider({"embeddings": [[0.5, 0.6, 0.7, 0.8]]})
        assert provider._invoke(["x"]) == [[0.5, 0.6, 0.7, 0.8]]

    def test_raises_on_an_unrecognised_shape(self):
        # Better a clear error at the boundary than a None reaching the database.
        provider = self._provider({"unexpected": True})
        with pytest.raises(EmbeddingError, match="unexpected Cohere response shape"):
            provider._invoke(["x"])

    def test_returns_one_vector_per_input(self):
        provider = self._provider({"embeddings": {"float": [[1, 2, 3, 4], [5, 6, 7, 8]]}})
        assert len(provider._invoke(["a", "b"])) == 2


class TestProviderResolution:
    async def test_takes_the_first_provider_that_answers(self, monkeypatch):
        first, second = StubProvider("first"), StubProvider("second")
        monkeypatch.setattr("app.embeddings.build_candidates", lambda _s: [first, second])

        selected = await resolve_provider(Settings())

        assert selected.name == "first"
        # A working first choice must not cost a call to the fallback.
        assert second.calls == 0

    async def test_falls_through_to_the_next_when_one_fails(self, monkeypatch):
        broken, working = StubProvider("broken", fail=True), StubProvider("working")
        monkeypatch.setattr("app.embeddings.build_candidates", lambda _s: [broken, working])

        assert (await resolve_provider(Settings())).name == "working"

    async def test_rejects_a_provider_returning_the_wrong_width(self, monkeypatch):
        # A wrong-width vector would fail at insert time; catching it during the
        # probe turns a per-save crash into one clear startup message.
        wrong, good = StubProvider("wrong", wrong_dim=True), StubProvider("good")
        monkeypatch.setattr("app.embeddings.build_candidates", lambda _s: [wrong, good])

        assert (await resolve_provider(Settings())).name == "good"

    async def test_raises_when_nothing_is_reachable(self, monkeypatch):
        monkeypatch.setattr(
            "app.embeddings.build_candidates", lambda _s: [StubProvider("broken", fail=True)]
        )
        with pytest.raises(EmbeddingError, match="No embedding provider is reachable"):
            await resolve_provider(Settings())

    async def test_raises_when_no_provider_is_configured_at_all(self):
        settings = Settings(openai_api_key="", embedding_provider="bedrock")
        with pytest.raises(EmbeddingError, match="No embedding provider is reachable"):
            await resolve_provider(settings)


class TestBuildEmbeddingInput:
    def test_puts_the_title_first(self):
        assert build_embedding_input("Title", "Body").startswith("Title")

    def test_handles_a_missing_title(self):
        assert build_embedding_input(None, "Body") == "Body"

    def test_truncates_to_the_limit(self):
        assert len(build_embedding_input("T", "x" * 50_000, limit=100)) == 100
