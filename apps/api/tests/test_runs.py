"""Which compile runs may be queued again.

The retry endpoint's guard is the whole test surface worth having here. Getting
it wrong is silent and destructive in a way a 500 would not be: retrying a
``succeeded`` run merges its claims into the page a second time, so the wiki
grows duplicates that look like genuine corroboration from a single source.
"""

from __future__ import annotations

import typing

import pytest

from app.routers.runs import RETRYABLE_STATUSES
from app.schemas import RunStatus

ALL_STATUSES = frozenset(typing.get_args(RunStatus))


class TestRetryableStatuses:
    def test_a_failed_run_can_be_retried(self):
        # The common case: the agent was down, nothing was written, try again.
        assert "failed" in RETRYABLE_STATUSES

    def test_a_run_stuck_in_the_queue_can_be_retried(self):
        # A queued run whose job was lost with the Redis queue is indistinguishable
        # from a failure, except that nothing ever marked it failed.
        assert "queued" in RETRYABLE_STATUSES

    def test_a_succeeded_run_is_never_retryable(self):
        # Its claims are already merged; compiling again duplicates them.
        assert "succeeded" not in RETRYABLE_STATUSES

    def test_a_running_run_is_never_retryable(self):
        # The agent already holds it — a second job compiles the same item twice.
        assert "running" not in RETRYABLE_STATUSES

    def test_every_status_is_accounted_for(self):
        # Fails when a new run status is introduced, forcing whoever adds it to
        # decide whether it is safe to re-queue rather than inheriting "no".
        assert RETRYABLE_STATUSES <= ALL_STATUSES
        undecided = ALL_STATUSES - RETRYABLE_STATUSES - {"succeeded", "running"}
        assert not undecided, f"new run status needs a retry decision: {undecided}"

    @pytest.mark.parametrize("status", sorted(ALL_STATUSES))
    def test_membership_is_decidable_for_every_status(self, status):
        assert isinstance(status in RETRYABLE_STATUSES, bool)
