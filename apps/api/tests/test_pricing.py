"""Turning tokens into money.

The failure mode here is silent and expensive in both directions: a rate read as
per-thousand when it is per-million overstates the bill a thousandfold, and an
unknown model rendered as $0.00 understates it to nothing. Neither shows up as an
error — they show up as a number someone plans with.

The distinction these pin hardest is unknown versus zero. They are different
claims and the API returns them differently.
"""

from __future__ import annotations

import importlib
from decimal import Decimal

import pytest

from app import pricing
from app.config import get_settings


@pytest.fixture
def priced(monkeypatch):
    """Reloads the module with a known price list.

    Two caches to defeat, both deliberate in production: PRICES is read once at
    import so a rate cannot change midway through a process, and get_settings is
    lru_cached so .env is parsed once. A test wanting different rates has to
    clear the second and reload the first.
    """

    def _load(raw: str):
        monkeypatch.setenv("AI_PRICING", raw)
        get_settings.cache_clear()
        return importlib.reload(pricing)

    yield _load
    monkeypatch.delenv("AI_PRICING", raising=False)
    get_settings.cache_clear()
    importlib.reload(pricing)


class TestEstimateUsd:
    def test_unknown_model_costs_unknown_not_zero(self, priced):
        module = priced('{"known":{"input":1}}')
        # The whole point: zero would claim the call was free.
        assert module.estimate_usd("some-other-model", 1000, 500) is None

    def test_rates_are_per_million_tokens(self, priced):
        module = priced('{"m":{"input":3.0}}')
        # One million input tokens at $3/M is $3, not $3000.
        assert module.estimate_usd("m", 1_000_000, 0) == Decimal(3)

    def test_input_and_output_are_priced_separately(self, priced):
        module = priced('{"m":{"input":1.0,"output":5.0}}')
        # 1M in at $1 plus 1M out at $5.
        assert module.estimate_usd("m", 1_000_000, 1_000_000) == Decimal(6)

    def test_a_model_with_no_output_rate_is_input_only(self, priced):
        # Embedding models have no output tokens at all.
        module = priced('{"embed":{"input":0.1}}')
        assert module.estimate_usd("embed", 1_000_000, None) == Decimal("0.1")

    def test_none_token_counts_are_treated_as_zero_not_as_an_error(self, priced):
        module = priced('{"m":{"input":1.0,"output":1.0}}')
        assert module.estimate_usd("m", None, None) == Decimal(0)

    def test_a_priced_model_with_no_tokens_costs_zero_not_unknown(self, priced):
        # Zero is right here: the rate IS known, the usage was nil.
        module = priced('{"m":{"input":1.0}}')
        assert module.estimate_usd("m", 0, 0) == Decimal(0)


class TestPriceListParsing:
    def test_no_configuration_prices_nothing(self, priced):
        module = priced("")
        assert module.PRICES == {}
        assert module.estimate_usd("anything", 10, 10) is None

    def test_rates_are_read_from_env_not_the_process_environment(self, priced):
        # The bug this pins: .env is parsed by pydantic-settings, which puts
        # nothing into os.environ. Reading the rate with os.getenv found nothing
        # for a value plainly present in .env, and the only symptom was cost
        # staying unknown forever, with no error anywhere.
        module = priced('{"m":{"input":1.0}}')
        assert module.PRICES, "rates configured in settings must reach the price table"

    @pytest.mark.parametrize(
        "raw",
        ["{not json", '["a","list"]', '{"m":"not an object"}', '{"m":{"input":"free"}}'],
    )
    def test_malformed_configuration_does_not_stop_the_api_booting(self, priced, raw):
        # Recording usage is observability. Observability that takes the product
        # down when misconfigured has cost more than it ever saved.
        module = priced(raw)
        assert module.estimate_usd("m", 10, 10) is None

    def test_one_bad_entry_does_not_discard_the_good_ones(self, priced):
        module = priced('{"good":{"input":2.0},"bad":{"input":"free"}}')
        assert module.estimate_usd("good", 1_000_000, 0) == Decimal(2)
        assert module.estimate_usd("bad", 1_000_000, 0) is None


class TestForgivingMatch:
    """Nobody would think to write down the id these rows actually store."""

    def test_matches_the_id_an_embedding_row_really_carries(self, priced):
        # The row records prefix, inference profile and region; a person writes
        # the model's name. Demanding they be identical priced nothing and said
        # nothing about why.
        module = priced('{"cohere-embed-v4":{"input":0.12}}')
        stored = "bedrock:global.cohere.embed-v4:0@ap-southeast-3"
        assert module.estimate_usd(stored, 1_000_000, None) == Decimal("0.12")

    def test_punctuation_and_case_do_not_matter(self, priced):
        module = priced('{"ZAI_GLM5":{"input":2.0}}')
        assert module.estimate_usd("zai.glm-5", 1_000_000, 0) == Decimal(2)

    def test_the_longest_match_wins(self, priced):
        # Otherwise a general name quietly claims a specific model's calls.
        module = priced('{"gpt-4":{"input":1.0},"gpt-4o-mini":{"input":9.0}}')
        assert module.estimate_usd("gpt-4o-mini-2024", 1_000_000, 0) == Decimal(9)

    def test_an_unrelated_model_is_still_unpriced(self, priced):
        module = priced('{"cohere-embed-v4":{"input":0.12}}')
        assert module.estimate_usd("zai.glm-5", 1_000_000, 0) is None

    def test_backfilled_rows_stay_unknown(self, priced):
        # `unknown` must never accidentally match a configured name — those rows
        # predate the log and there is genuinely no rate for them.
        module = priced('{"zai.glm-5":{"input":1.0},"n":{"input":1.0}}')
        assert module.estimate_usd("unknown", 1_000_000, 0) is None


class TestTokensFromText:
    def test_empty_text_is_no_tokens(self):
        assert pricing.tokens_from_text("") == 0
        assert pricing.tokens_from_text(None) == 0

    def test_short_text_still_counts_as_one(self):
        # A call that happened cost something; rounding it to zero would hide it.
        assert pricing.tokens_from_text("hi") == 1

    def test_scales_with_length(self):
        assert pricing.tokens_from_text("x" * 4000) == 1000
