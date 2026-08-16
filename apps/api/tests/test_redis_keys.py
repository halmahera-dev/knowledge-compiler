"""The hash tag that keeps arq usable on a Redis Cluster.

Production runs ElastiCache Serverless, which is always clustered and rejects a
multi-key command whose keys hash apart. These assert the two things that were
actually wrong when this was found by hand on the server: that patching one
module is not enough, and that both ends agree on the queue name.
"""

from __future__ import annotations

import arq.connections
import arq.constants
import arq.jobs
import arq.worker

from app.core.queue import QUEUE_NAME
from app.core.redis_keys import apply_hash_tag


class TestHashTag:
    def test_every_key_shares_one_slot(self):
        apply_hash_tag()

        # Redis reads the slot from the first {...}. Same tag, same slot.
        for name in (
            "default_queue_name",
            "job_key_prefix",
            "in_progress_key_prefix",
            "result_key_prefix",
            "retry_key_prefix",
            "abort_jobs_ss",
        ):
            value = getattr(arq.constants, name)
            assert value.startswith("{arq}"), f"{name} is outside the tag: {value}"

    def test_the_modules_that_copied_the_names_were_patched_too(self):
        apply_hash_tag()

        # arq.connections, arq.jobs and arq.worker each do `from .constants
        # import job_key_prefix`, so they hold their own binding. Rewriting only
        # arq.constants leaves the enqueue side writing where the worker never
        # looks — jobs that queue and never run, with no error anywhere.
        for module in (arq.connections, arq.jobs, arq.worker):
            for name in ("default_queue_name", "job_key_prefix"):
                if hasattr(module, name):
                    value = getattr(module, name)
                    assert value.startswith("{arq}"), (
                        f"{module.__name__}.{name} still holds {value}"
                    )

    def test_both_ends_name_the_same_queue(self):
        from app.worker import WorkerSettings

        # `Worker.__init__` binds `queue_name = default_queue_name` at import,
        # before any patch can reach it, so the name has to be passed
        # explicitly at both ends. If these ever drift, saves queue and nothing
        # compiles.
        assert WorkerSettings.queue_name == QUEUE_NAME
        assert QUEUE_NAME.startswith("{arq}")
