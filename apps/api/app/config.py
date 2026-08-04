"""Application settings.

The `.env` contract is deliberately small: the block a developer must fill in is
just the database URLs, the Bedrock credentials, and the web app's API URL.
Everything else in this module is derived from those, so adding a service does
not add a required environment variable.

Two derivations are worth knowing about:

* ``COCKROACH_URL`` arrives as a plain ``postgresql://`` URL (that is what Prisma
  and psql want). SQLAlchemy needs a dialect-qualified URL, so it is rewritten to
  ``cockroachdb+asyncpg://`` here rather than duplicating the value in `.env`.

* Bedrock Mantle serves chat but has no ``/v1/embeddings`` endpoint, so
  embeddings go through the separate ``bedrock-runtime`` service via boto3.
  A Bedrock API key is valid for both, so ``OPENAI_API_KEY`` doubles as
  ``AWS_BEARER_TOKEN_BEDROCK`` and the region is parsed out of
  ``OPENAI_BASE_URL``.
"""

from __future__ import annotations

import re
from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Our tables live in a dedicated schema because `knowledge_base` is shared with
# an unrelated project whose tables sit in `public`.
DB_SCHEMA = "kc"

# Titan v2 emits 1024 dimensions, and the local fallback model is chosen to match,
# so the VECTOR(1024) column holds either without a migration.
EMBEDDING_DIM = 1024

_MANTLE_REGION_RE = re.compile(r"bedrock-mantle\.([a-z0-9-]+)\.api\.aws")


def to_sqlalchemy_url(url: str) -> str:
    """Rewrite a plain Postgres URL into the async CockroachDB dialect SQLAlchemy needs.

    Query parameters that belong to libpq rather than asyncpg (``sslmode``,
    ``schema``) are dropped — asyncpg rejects unknown keywords, and the schema is
    applied via ``search_path`` in the connect args instead.
    """
    parts = urlsplit(url)
    scheme = "cockroachdb+asyncpg"

    dropped = {"sslmode", "schema", "options", "application_name"}
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in dropped]

    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


#: The published default. Both processes fall back to it, so it is a shared
#: secret only in the sense that everyone shares it.
DEV_INTERNAL_TOKEN = "dev-internal-token"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Loaded from the repo root so every app shares one .env.
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── required ─────────────────────────────────────────────────────────────
    cockroach_url: str = "postgresql://root@localhost:26257/knowledge_base?sslmode=disable"
    redis_uri: str = "redis://:redispw123@localhost:6379/0"
    openai_api_key: str = ""
    openai_base_url: str = "https://bedrock-mantle.ap-southeast-3.api.aws/v1"
    bedrock_model: str = "zai.glm-5"
    bedrock_project: str = "default"

    # ── services ─────────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    mastra_url: str = "http://localhost:4111"
    internal_api_url: str = "http://localhost:8000"
    #: Shared secret for the agent→API write endpoints.
    #:
    #: Kept as a working default so `pnpm dev` needs no configuration, but the
    #: value is published in this repository — anything reachable beyond
    #: localhost must override it, or the internal endpoints are unauthenticated
    #: in practice. Startup says so loudly; see `internal_token_is_default`.
    internal_api_token: str = DEV_INTERNAL_TOKEN

    # Browser origins allowed to call the API. The extension is granted access via
    # a permissive `chrome-extension://` check in main.py rather than listing ids.
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # ── embeddings ───────────────────────────────────────────────────────────
    # "auto" probes bedrock first and falls back to local; see embeddings.py.
    embedding_provider: str = "auto"
    embedding_model_id: str = "amazon.titan-embed-text-v2:0"
    # Cohere Embed v4 is the only embedding model available in APAC, and must be
    # addressed through an inference profile id — the bare `cohere.embed-v4:0`
    # rejects on-demand throughput.
    cohere_embedding_model_id: str = "global.cohere.embed-v4:0"
    embedding_fallback_region: str = "ap-southeast-1"
    embedding_dim: int = EMBEDDING_DIM
    # 384-dim and ~130MB, zero-padded to the column width — see LocalProvider for
    # why that is exact for cosine. The 1024-dim models are ~1.3GB, too much to
    # download for a path that only runs when Bedrock is unreachable.
    local_embedding_model: str = "BAAI/bge-small-en-v1.5"

    aws_region: str = ""
    aws_bearer_token_bedrock: str = ""

    # ── auth ─────────────────────────────────────────────────────────────────
    # Where Better Auth runs. Its JWKS lives at {auth_base_url}/api/auth/jwks and
    # is also the `iss` every token must carry, so this doubles as the issuer.
    auth_base_url: str = "http://localhost:3000"
    auth_audience: str = "knowledge-compiler-api"
    # Signing keys change only on rotation; a verification failure refetches
    # immediately, so this is a ceiling rather than a freshness requirement.
    jwks_cache_seconds: int = 3600
    # Lets the single-user v1 flows keep working while auth is being wired in.
    # MUST be false before this is exposed to anyone but you.
    allow_anonymous: bool = False

    # ── behaviour ────────────────────────────────────────────────────────────
    # Only used when allow_anonymous is on, to stand in for a signed-in user.
    # 'legacy' is the sentinel workspace the workspace migration parked
    # pre-auth content in, so anonymous mode sees exactly that and nothing else.
    default_user_id: str = "legacy"
    default_workspace_id: str = "legacy"
    # Cosine similarity above which an item merges into an existing page. Leave
    # unset to use the active provider's calibrated value — models disagree about
    # what a given similarity score means, so a hardcoded global default would
    # merge too eagerly on one and never merge on another.
    match_threshold: float | None = None
    match_top_k: int = 5
    # Model rates for the AI usage log, as JSON — see pricing.py. Declared here
    # rather than read with os.getenv, because .env is loaded by pydantic-settings
    # and that does not put anything into the process environment: a value set in
    # .env was simply invisible to os.getenv, and cost silently stayed unknown.
    ai_pricing: str = ""
    llm_max_retries: int = 2
    # Guard against a pathological paste blowing up an LLM call.
    max_content_chars: int = 200_000
    # Read fully into memory, so this is the real memory ceiling per upload.
    max_pdf_bytes: int = 40 * 1024 * 1024

    # ── object storage ───────────────────────────────────────────────────────
    # MinIO, already provisioned in docker-compose. Archiving the original file
    # is best-effort: if this is unreachable the upload still succeeds, because
    # losing the archive costs less than refusing the user's save.
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "miniopassword123"
    s3_bucket: str = "knowledge-compiler"
    s3_region: str = "us-east-1"
    fetch_timeout_seconds: float = 20.0
    #: Redirect hops allowed when saving a link. Each one is re-validated against
    #: the SSRF guard before it is requested, so this bounds the work rather than
    #: the risk; the default matches what browsers and httpx use.
    fetch_max_redirects: int = 5

    #: Compiles a single workspace may start per hour. Each one is a model call,
    #: and a long PDF is several, so this is a spend ceiling rather than an abuse
    #: control — set well above what reading generates and well below a loop.
    compile_rate_limit_per_hour: int = 120
    #: Copilot questions per workspace per hour. Cheaper than a compile (one
    #: embedding plus one answer), so the allowance is larger.
    ask_rate_limit_per_hour: int = 240
    log_level: str = "INFO"

    @property
    def internal_token_is_default(self) -> bool:
        """Whether the agent→API secret is still the one printed in the repo."""
        return self.internal_api_token == DEV_INTERNAL_TOKEN

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        """Accept a comma-separated string as well as a JSON list."""
        if isinstance(v, str) and not v.strip().startswith("["):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @property
    def sqlalchemy_url(self) -> str:
        return to_sqlalchemy_url(self.cockroach_url)

    @property
    def resolved_region(self) -> str:
        """Region for bedrock-runtime calls.

        Prefers an explicit AWS_REGION, otherwise reads it out of the Mantle base
        URL so the chat and embedding endpoints stay in the same region by default.
        """
        if self.aws_region:
            return self.aws_region
        match = _MANTLE_REGION_RE.search(self.openai_base_url)
        return match.group(1) if match else "us-east-1"

    @property
    def resolved_bedrock_token(self) -> str:
        """Bearer token for bedrock-runtime.

        Bedrock API keys are accepted by both the Mantle endpoint and
        bedrock-runtime, so the single key in `.env` covers chat and embeddings.
        """
        return self.aws_bearer_token_bedrock or self.openai_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
