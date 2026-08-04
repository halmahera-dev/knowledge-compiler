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


@pytest.fixture
def priced(monkeypatch):
    """Reloads the module with a known price list.

    PRICES is read once at import, deliberately, so a rate cannot change midway
    through a process. That means a test wanting different rates has to reload.
    """

    def _load(raw: str):
        monkeypatch.setenv("AI_PRICING", raw)
        return importlib.reload(pricing)

    yield _load
    monkeypatch.delenv("AI_PRICING", raising=False)
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
    def test_no_configuration_prices_nothing(self, monkeypatch):
        monkeypatch.delenv("AI_PRICING", raising=False)
        module = importlib.reload(pricing)
        assert module.PRICES == {}
        assert module.estimate_usd("anything", 10, 10) is None

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


class TestTokensFromText:
    def test_empty_text_is_no_tokens(self):
        assert pricing.tokens_from_text("") == 0
        assert pricing.tokens_from_text(None) == 0

    def test_short_text_still_counts_as_one(self):
        # A call that happened cost something; rounding it to zero would hide it.
        assert pricing.tokens_from_text("hi") == 1

    def test_scales_with_length(self):
        assert pricing.tokens_from_text("x" * 4000) == 1000
