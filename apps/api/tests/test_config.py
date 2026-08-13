"""Config derivation — the `.env` contract the whole stack depends on."""

from __future__ import annotations

import pytest

from app.core.config import DEV_INTERNAL_TOKEN, Settings, to_sqlalchemy_url


class TestSqlAlchemyUrlRewrite:
    """`.env` holds the plain postgresql:// URL that Prisma and psql want.

    SQLAlchemy needs a dialect-qualified URL, so it is rewritten rather than
    duplicated in the environment.
    """

    def test_rewrites_scheme_to_async_cockroach_dialect(self):
        url = to_sqlalchemy_url("postgresql://root@localhost:26257/knowledge_base")
        assert url.startswith("cockroachdb+asyncpg://")

    def test_drops_sslmode(self):
        # asyncpg rejects libpq-only keywords outright.
        url = to_sqlalchemy_url(
            "postgresql://root@localhost:26257/knowledge_base?sslmode=disable"
        )
        assert "sslmode" not in url

    def test_drops_schema_param(self):
        # The schema is applied via search_path in connect args instead.
        url = to_sqlalchemy_url("postgresql://root@localhost:26257/kb?schema=kc")
        assert "schema" not in url

    def test_preserves_host_and_database(self):
        url = to_sqlalchemy_url("postgresql://root@db.internal:26257/knowledge_base?sslmode=x")
        assert "db.internal:26257" in url
        assert url.endswith("/knowledge_base")

    def test_preserves_credentials(self):
        url = to_sqlalchemy_url("postgresql://user:secret@host:26257/db")
        assert "user:secret@host" in url


class TestDerivedBedrockSettings:
    """Bedrock Mantle has no /v1/embeddings, so embeddings use bedrock-runtime.

    Both accept the same Bedrock API key, so the single key in `.env` covers each
    and no extra required variables are introduced.
    """

    @pytest.mark.parametrize(
        ("base_url", "expected"),
        [
            ("https://bedrock-mantle.ap-southeast-3.api.aws/v1", "ap-southeast-3"),
            ("https://bedrock-mantle.us-east-1.api.aws/v1", "us-east-1"),
            ("https://bedrock-mantle.eu-central-1.api.aws/v1", "eu-central-1"),
        ],
    )
    def test_parses_region_from_mantle_base_url(self, base_url, expected):
        assert Settings(openai_base_url=base_url).resolved_region == expected

    def test_explicit_region_wins(self):
        settings = Settings(
            openai_base_url="https://bedrock-mantle.ap-southeast-3.api.aws/v1",
            aws_region="us-west-2",
        )
        assert settings.resolved_region == "us-west-2"

    def test_falls_back_when_url_is_not_a_mantle_endpoint(self):
        assert Settings(openai_base_url="https://proxy.internal/v1").resolved_region == "us-east-1"

    def test_reuses_openai_key_as_bedrock_token(self):
        assert Settings(openai_api_key="sk-abc").resolved_bedrock_token == "sk-abc"

    def test_explicit_bedrock_token_wins(self):
        settings = Settings(openai_api_key="sk-abc", aws_bearer_token_bedrock="bedrock-xyz")
        assert settings.resolved_bedrock_token == "bedrock-xyz"


class TestMatchThreshold:
    def test_defaults_to_none_so_the_provider_decides(self):
        # Models place unrelated text at different baseline similarities, so a
        # single global constant would misbehave on one provider or the other.
        assert Settings().match_threshold is None

    def test_accepts_an_explicit_override(self):
        assert Settings(match_threshold=0.9).match_threshold == 0.9


class TestCorsOrigins:
    def test_accepts_a_comma_separated_string(self):
        settings = Settings(cors_origins="http://a.test, http://b.test")
        assert settings.cors_origins == ["http://a.test", "http://b.test"]

    def test_accepts_a_list(self):
        assert Settings(cors_origins=["http://c.test"]).cors_origins == ["http://c.test"]


class TestInternalTokenDefault:
    """The agent→API secret is the only guard on the write endpoints.

    Its default is a literal in this repository, which is fine for a stack that
    only ever listens on localhost and a full write bypass for anything else. The
    flag below is what makes startup say so, so it has to stay honest.
    """

    def test_reports_the_published_default_as_default(self):
        settings = Settings(internal_api_token=DEV_INTERNAL_TOKEN)
        assert settings.internal_token_is_default is True

    def test_reports_a_configured_token_as_not_default(self):
        settings = Settings(internal_api_token="Wm5x9-QnR1tVb2p8sK4e")
        assert settings.internal_token_is_default is False

    def test_a_token_that_merely_contains_the_default_is_not_default(self):
        # Substring matching here would let a real secret be reported as unsafe.
        settings = Settings(internal_api_token=f"{DEV_INTERNAL_TOKEN}-but-longer")
        assert settings.internal_token_is_default is False

    def test_the_unset_default_is_the_published_one(self):
        # Pins the zero-config promise: `pnpm dev` works without setting it, and
        # that convenience is exactly why the warning has to exist.
        #
        # Constructed without the env file on purpose. Reading the developer's
        # own .env would make this assert on their configuration rather than on
        # the default — it failed exactly that way once a real token was set.
        assert Settings(_env_file=None).internal_api_token == DEV_INTERNAL_TOKEN
