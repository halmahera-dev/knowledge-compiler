"""Embedding providers.

Bedrock Mantle — the endpoint serving GLM-5 for chat — has no ``/v1/embeddings``.
Its documented surface is ``/v1/models``, ``/v1/responses``, and
``/v1/chat/completions``. Embeddings therefore go through the separate
``bedrock-runtime`` service via boto3, which accepts the same Bedrock API key as
a bearer token.

Titan Text Embeddings V2 is not confirmed available in every region — Bedrock
launched in ap-southeast-3 (Jakarta) in September 2025 with a partial catalogue.
Rather than fail at first use, ``resolve_provider`` probes a chain at startup and
takes the first provider that answers:

    1. Titan v2 in the configured region
    2. Titan v2 in the fallback region
    3. a local ONNX model (no network, no credentials)

All three emit 1024-dimensional vectors so ``VECTOR(1024)`` holds any of them,
and whichever wins is recorded per row in ``embedding_model``. Vectors from
different models are not comparable, so switching providers on an existing
database requires re-embedding — see ``app.cli reembed``.
"""

from __future__ import annotations

import asyncio
import json
from typing import Protocol

import structlog

from app.core.config import Settings

log = structlog.get_logger(__name__)


class EmbeddingError(RuntimeError):
    pass


class EmbeddingProvider(Protocol):
    """Anything that turns text into a fixed-width vector."""

    #: Recorded in `embedding_model` so a later provider change is detectable.
    name: str
    dim: int
    #: Cosine similarity above which two texts are considered the same topic.
    #:
    #: This belongs to the provider, not to the application: models place
    #: unrelated text at different baseline similarities, so one global constant
    #: would merge too eagerly on one model and never merge on another. Measured
    #: on this project's own content — see `suggested_threshold` on each provider.
    suggested_threshold: float

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class BedrockTitanProvider:
    """Amazon Titan Text Embeddings V2 via ``bedrock-runtime``."""

    #: Titan v2 returns normalized vectors and separates topics cleanly, so an
    #: unrelated pair sits well below this.
    suggested_threshold = 0.78

    def __init__(self, *, region: str, token: str, model_id: str, dim: int) -> None:
        self.region = region
        self.model_id = model_id
        self.dim = dim
        self.name = f"bedrock:{model_id}@{region}"
        self._token = token
        self._client = None

    def _get_client(self):
        if self._client is None:
            # boto3 picks up a Bedrock API key from this variable; setting it in
            # the process environment is how the key reaches the signer.
            import os

            import boto3
            from botocore.config import Config

            os.environ.setdefault("AWS_BEARER_TOKEN_BEDROCK", self._token)

            self._client = boto3.client(
                "bedrock-runtime",
                region_name=self.region,
                config=Config(
                    retries={"max_attempts": 3, "mode": "standard"},
                    connect_timeout=10,
                    read_timeout=30,
                ),
            )
        return self._client

    def _invoke_one(self, text: str) -> list[float]:
        client = self._get_client()
        response = client.invoke_model(
            modelId=self.model_id,
            body=json.dumps({"inputText": text, "dimensions": self.dim, "normalize": True}),
            accept="application/json",
            contentType="application/json",
        )
        payload = json.loads(response["body"].read())
        vector = payload.get("embedding")
        if not isinstance(vector, list):
            raise EmbeddingError(f"unexpected Titan response shape: {list(payload)}")
        return [float(x) for x in vector]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # Titan embeds one input per call, and boto3 is synchronous, so calls are
        # spread across the default executor to avoid blocking the event loop.
        return await asyncio.gather(*(asyncio.to_thread(self._invoke_one, t) for t in texts))


class CohereEmbedProvider:
    """Cohere Embed v4 via ``bedrock-runtime``.

    This is the embedding model actually available in APAC. Titan is not: as of
    this writing ap-southeast-3 (Jakarta) lists exactly one embedding model and
    ap-southeast-1 lists three, none of them Titan.

    Two things differ from Titan and are easy to get wrong:

    * It must be invoked through an **inference profile** id
      (``global.cohere.embed-v4:0``), not the bare model id. On-demand throughput
      against ``cohere.embed-v4:0`` is rejected outright.
    * It batches. Titan embeds one input per call; Cohere takes a list, so a
      compile that embeds several texts costs one request instead of several.
    """

    #: Cohere v4 scores far lower in absolute terms than Titan or BGE. Measured
    #: over the 18-source seed corpus (153 pairs, 3 known topic clusters):
    #:
    #:     within-cluster   min 0.215   median 0.369   max 0.651
    #:     cross-cluster    min 0.099   median 0.240   max 0.453
    #:
    #: The distributions overlap, so no threshold is clean. 0.40 merges 14/45
    #: same-topic pairs while wrongly merging only 2/108 unrelated ones; dropping
    #: to 0.35 gains 10 more correct merges but adds 9 wrong ones.
    #:
    #: Biased toward precision deliberately: a false merge fuses two unrelated
    #: topics into one page and needs an explicit undo, whereas a missed merge
    #: just leaves two pages that a later source can still join. Titan's 0.78
    #: would merge nothing at all here.
    suggested_threshold = 0.40

    #: Cohere distinguishes query from document embeddings. Everything here is a
    #: symmetric document-to-document comparison (does this item belong to that
    #: page), so both sides must use the same type or the geometry is meaningless.
    INPUT_TYPE = "search_document"

    def __init__(self, *, region: str, token: str, model_id: str, dim: int) -> None:
        self.region = region
        self.model_id = model_id
        self.dim = dim
        self.name = f"bedrock:{model_id}@{region}"
        self._token = token
        self._client = None

    def _get_client(self):
        if self._client is None:
            import os

            import boto3
            from botocore.config import Config

            os.environ.setdefault("AWS_BEARER_TOKEN_BEDROCK", self._token)
            self._client = boto3.client(
                "bedrock-runtime",
                region_name=self.region,
                config=Config(
                    retries={"max_attempts": 3, "mode": "standard"},
                    connect_timeout=10,
                    read_timeout=60,
                ),
            )
        return self._client

    def _invoke(self, texts: list[str]) -> list[list[float]]:
        response = self._get_client().invoke_model(
            modelId=self.model_id,
            body=json.dumps(
                {
                    "texts": texts,
                    "input_type": self.INPUT_TYPE,
                    "embedding_types": ["float"],
                    "output_dimension": self.dim,
                }
            ),
            accept="application/json",
            contentType="application/json",
        )
        payload = json.loads(response["body"].read())

        # v4 nests by embedding type; older Cohere revisions returned a bare list.
        embeddings = payload.get("embeddings")
        vectors = embeddings.get("float") if isinstance(embeddings, dict) else embeddings
        if not isinstance(vectors, list):
            raise EmbeddingError(f"unexpected Cohere response shape: {list(payload)}")

        return [[float(x) for x in vector] for vector in vectors]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # boto3 is synchronous, so the call goes to a worker thread.
        return await asyncio.to_thread(self._invoke, texts)


class LocalProvider:
    """ONNX sentence embeddings via fastembed. No network, no credentials.

    The natural 1024-dimensional models are ~1.3GB, which is a lot to download for
    something that only runs when Bedrock is unreachable. This uses a small model
    and zero-pads its output up to the column width instead.

    Zero-padding is exact, not an approximation: appending zeros to every vector
    leaves both the dot product and each norm unchanged, so cosine similarity is
    identical to what the unpadded model would give. It is only valid *within* one
    model — vectors from two different models are never comparable, padded or not,
    which is why `embedding_model` is stored per row.
    """

    #: BGE models are uncentered: unrelated text still scores around 0.48, and two
    #: phrasings of the same topic land near 0.72. Titan's 0.78 would never merge
    #: anything here.
    suggested_threshold = 0.70

    def __init__(self, *, model_name: str, dim: int) -> None:
        self.model_name = model_name
        self.dim = dim
        self.name = f"local:{model_name}"
        self._model = None
        self._native_dim: int | None = None

    def _get_model(self):
        if self._model is None:
            try:
                from fastembed import TextEmbedding
            except ImportError as exc:  # pragma: no cover - depends on install extra
                raise EmbeddingError(
                    "fastembed is not installed. Install the local embedding fallback with:\n"
                    "  uv sync --extra local-embeddings"
                ) from exc
            self._model = TextEmbedding(model_name=self.model_name)
        return self._model

    def _encode(self, texts: list[str]) -> list[list[float]]:
        model = self._get_model()
        vectors: list[list[float]] = []

        for raw in model.embed(texts):
            vector = [float(x) for x in raw]

            if self._native_dim is None:
                self._native_dim = len(vector)
                if self._native_dim > self.dim:
                    raise EmbeddingError(
                        f"{self.model_name} emits {self._native_dim} dimensions, which does "
                        f"not fit the VECTOR({self.dim}) column. Choose a model with at most "
                        f"{self.dim} dimensions."
                    )
                if self._native_dim < self.dim:
                    log.info(
                        "local_embeddings_padded",
                        model=self.model_name,
                        native_dim=self._native_dim,
                        padded_to=self.dim,
                    )

            if len(vector) < self.dim:
                vector.extend([0.0] * (self.dim - len(vector)))
            vectors.append(vector)

        return vectors

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await asyncio.to_thread(self._encode, texts)


async def _probe(provider: EmbeddingProvider) -> bool:
    """Confirm a provider actually answers before committing the process to it."""
    try:
        vectors = await provider.embed(["probe"])
    except Exception as exc:
        log.warning("embedding_probe_failed", provider=provider.name, error=str(exc))
        return False

    if not vectors or len(vectors[0]) != provider.dim:
        got = len(vectors[0]) if vectors else 0
        log.warning(
            "embedding_probe_wrong_dim", provider=provider.name, expected=provider.dim, got=got
        )
        return False

    return True


def build_candidates(settings: Settings) -> list[EmbeddingProvider]:
    """The providers to try, in order of preference.

    Separate from ``resolve_provider`` so the ordering can be asserted without
    standing up any of the providers themselves.
    """
    candidates: list[EmbeddingProvider] = []
    choice = settings.embedding_provider.lower()

    if choice in ("auto", "bedrock"):
        token = settings.resolved_bedrock_token
        if token:
            regions = [settings.resolved_region]
            if settings.embedding_fallback_region not in regions:
                regions.append(settings.embedding_fallback_region)

            # Cohere first: it is what APAC actually has. Titan is kept in the
            # chain because it is the better model where it exists (the US
            # regions), so a US deployment still prefers it.
            for region in regions:
                candidates.append(
                    CohereEmbedProvider(
                        region=region,
                        token=token,
                        model_id=settings.cohere_embedding_model_id,
                        dim=settings.embedding_dim,
                    )
                )
            for region in regions:
                candidates.append(
                    BedrockTitanProvider(
                        region=region,
                        token=token,
                        model_id=settings.embedding_model_id,
                        dim=settings.embedding_dim,
                    )
                )
        else:
            log.warning("bedrock_embeddings_skipped", reason="no API key configured")

    if choice in ("auto", "local"):
        candidates.append(
            LocalProvider(model_name=settings.local_embedding_model, dim=settings.embedding_dim)
        )

    return candidates


async def resolve_provider(settings: Settings) -> EmbeddingProvider:
    """Pick an embedding provider, probing each candidate before use.

    Raises ``EmbeddingError`` if nothing works, because silently starting without
    embeddings would degrade every topic match to a title comparison.
    """
    candidates = build_candidates(settings)

    for candidate in candidates:
        log.info("embedding_probe", provider=candidate.name)
        if await _probe(candidate):
            log.info("embedding_provider_selected", provider=candidate.name, dim=candidate.dim)
            return candidate

    raise EmbeddingError(
        "No embedding provider is reachable. Tried: "
        + ", ".join(c.name for c in candidates)
        + ".\nEither check the Bedrock key/region, or install the local fallback with "
        "`uv sync --extra local-embeddings` and set EMBEDDING_PROVIDER=local."
    )


def build_embedding_input(title: str | None, content: str, *, limit: int = 8000) -> str:
    """Compose the text that represents an item for similarity purposes.

    The title is repeated ahead of the body because topic matching cares far more
    about what a piece is *about* than about its full contents, and Titan truncates
    long inputs anyway.
    """
    head = (title or "").strip()
    body = content.strip()
    combined = f"{head}\n\n{body}" if head else body
    return combined[:limit]
