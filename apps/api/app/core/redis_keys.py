"""Making arq's keys land in one Redis Cluster slot.

AWS ElastiCache Serverless — which is what production runs — is always in
cluster mode, and a cluster refuses any command touching several keys unless
those keys hash to the same slot. arq does exactly that: enqueueing a job is one
transaction over the queue's sorted set and the job's own hash, and they hash
apart. The failure is a CROSSSLOT error at save time, and nothing compiles.

The fix is a hash tag. Redis computes the slot from the substring inside the
first `{...}` when one is present, so naming every key `{arq}:…` puts all of
them in one slot while leaving the names readable. On a single-node Redis the
braces are just characters, so this is applied unconditionally rather than
behind a flag — one code path, and no way for development to disagree with
production about where a job lives.

TWO THINGS THAT MAKE THIS LESS TIDY THAN IT LOOKS, both verified against arq
0.28 rather than assumed:

1. `arq.connections`, `arq.jobs` and `arq.worker` each do `from .constants
   import job_key_prefix`, which binds their own module-level name. Rewriting
   `arq.constants` alone would leave all three still using the originals, and
   the enqueue side would disagree with the consume side — jobs would be
   written where the worker never looks. So every module that took a copy is
   rewritten.

2. `Worker.__init__` declares `queue_name: str = default_queue_name`, so the
   default is bound when `arq.worker` is imported — before this runs. Patching
   the module attribute cannot reach it, which is why the queue name is also
   passed explicitly at both ends. Miss that and the worker listens on
   `arq:queue` while the API writes to `{arq}:queue`.
"""

from __future__ import annotations

import arq.connections
import arq.constants
import arq.jobs
import arq.worker

#: The tag itself. Any string works; the braces are what Redis reads.
_TAG = "{arq}"

#: What both ends must name the queue. Exported because it cannot be left to
#: the patched default — see note 2 above.
QUEUE_NAME = f"{_TAG}:queue"

#: Every key name arq holds, and what it becomes. Written out rather than
#: derived from the attribute name: a rule like "strip _prefix and swap
#: underscores" silently invents a key name when arq adds one, and a wrong key
#: name fails as "no jobs ever run" rather than as an error.
_RENAMES = {
    "default_queue_name": QUEUE_NAME,
    "job_key_prefix": f"{_TAG}:job:",
    "in_progress_key_prefix": f"{_TAG}:in-progress:",
    "result_key_prefix": f"{_TAG}:result:",
    "retry_key_prefix": f"{_TAG}:retry:",
    "abort_jobs_ss": f"{_TAG}:abort",
}

_MODULES = (arq.constants, arq.connections, arq.jobs, arq.worker)


def apply_hash_tag() -> None:
    """Rewrite arq's key names in place. Safe to call more than once."""
    for module in _MODULES:
        for name, value in _RENAMES.items():
            # Only where the module actually holds the name: arq.connections
            # copies three of the six, and setting the others would add
            # attributes that nothing reads and that would mislead the next
            # person to check whether the patch is complete.
            if hasattr(module, name):
                setattr(module, name, value)
