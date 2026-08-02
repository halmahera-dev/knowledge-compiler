"""The spend ceiling on compiles.

Every save is a model call and a long PDF is several, so an unbounded save
endpoint is an unbounded bill. The limiter exists to turn that into a number.

Two properties matter more than the counting, and both are here: it is keyed by
workspace, so one account cannot spend another's allowance or be throttled by it;
and it fails open, because a limiter that takes the API down when Redis blinks
has traded a cost control for an outage.
"""

from __future__ import annotations

import pytest

from app import ratelimit
from app.ratelimit import RateLimitExceeded, check
from app.scoping import Scope


class FakeRedis:
    """Counts like Redis does, and can be told to break."""

    def __init__(self, *, broken: bool = False):
        self.counters: dict[str, int] = {}
        self.expiries: dict[str, int] = {}
        self.broken = broken

    async def incr(self, key: str) -> int:
        if self.broken:
            raise ConnectionError("redis is down")
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]

    async def expire(self, key: str, seconds: int) -> None:
        if self.broken:
            raise ConnectionError("redis is down")
        self.expiries[key] = seconds


@pytest.fixture
def redis(monkeypatch) -> FakeRedis:
    fake = FakeRedis()
    monkeypatch.setattr(ratelimit, "get_redis", lambda: fake)
    return fake


def scope_for(workspace: str) -> Scope:
    return Scope(workspace_id=workspace, user_id="u", role="member")


ALICE = scope_for("ws_alice")
BOB = scope_for("ws_bob")


@pytest.mark.asyncio
class TestCheck:
    async def test_allows_calls_up_to_the_limit(self, redis):
        for _ in range(3):
            await check(ALICE, name="compile", limit=3, window_seconds=3600)

    async def test_refuses_the_one_after(self, redis):
        for _ in range(3):
            await check(ALICE, name="compile", limit=3, window_seconds=3600)

        with pytest.raises(RateLimitExceeded) as raised:
            await check(ALICE, name="compile", limit=3, window_seconds=3600)

        assert raised.value.status_code == 429

    async def test_says_how_long_to_wait(self, redis):
        # A 429 a client cannot act on is just a failure.
        await check(ALICE, name="compile", limit=1, window_seconds=3600)
        with pytest.raises(RateLimitExceeded) as raised:
            await check(ALICE, name="compile", limit=1, window_seconds=3600)

        retry_after = int(raised.value.headers["Retry-After"])
        assert 0 < retry_after <= 3600

    async def test_one_workspace_cannot_exhaust_another(self, redis):
        # The whole reason it is keyed by workspace and not by IP.
        for _ in range(5):
            await check(ALICE, name="compile", limit=5, window_seconds=3600)

        await check(BOB, name="compile", limit=5, window_seconds=3600)

    async def test_allowances_are_separate_per_name(self, redis):
        # Asking a lot of questions must not stop you saving anything.
        for _ in range(2):
            await check(ALICE, name="ask", limit=2, window_seconds=3600)

        await check(ALICE, name="compile", limit=2, window_seconds=3600)

    async def test_the_window_expires_so_the_allowance_returns(self, redis):
        await check(ALICE, name="compile", limit=1, window_seconds=3600)
        key = next(iter(redis.counters))
        assert redis.expiries[key] == 3600

    async def test_expiry_is_set_only_on_the_first_hit(self, redis):
        # Re-expiring on every call would slide the window forward and could keep
        # a busy workspace locked out indefinitely.
        for _ in range(3):
            await check(ALICE, name="compile", limit=10, window_seconds=60)

        key = next(iter(redis.counters))
        assert redis.counters[key] == 3
        assert redis.expiries == {key: 60}

    async def test_a_broken_redis_does_not_block_the_request(self, monkeypatch):
        # Fails open on purpose: losing the ceiling beats losing the API.
        monkeypatch.setattr(ratelimit, "get_redis", lambda: FakeRedis(broken=True))

        for _ in range(50):
            await check(ALICE, name="compile", limit=1, window_seconds=3600)

    async def test_windows_do_not_share_a_key(self, redis, monkeypatch):
        monkeypatch.setattr(ratelimit.time, "time", lambda: 0.0)
        await check(ALICE, name="compile", limit=1, window_seconds=60)

        # Next window, same workspace: the allowance is fresh.
        monkeypatch.setattr(ratelimit.time, "time", lambda: 60.0)
        await check(ALICE, name="compile", limit=1, window_seconds=60)

        assert len(redis.counters) == 2
