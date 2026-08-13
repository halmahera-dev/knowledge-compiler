"""Object storage for original uploads.

A PDF is compiled into text, but the file itself is worth keeping: the compiled
page cites page numbers, and a reader who wants to check one needs the original.
Storing only the extracted text would make every citation unverifiable.

MinIO speaks S3, and boto3 is already a dependency for Bedrock, so this adds a
config block rather than a library.

Storage is deliberately optional. If MinIO is not running the upload still
succeeds and the compile still runs — losing the archived original is worth far
less than refusing the user's save.
"""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass

import structlog

from app.core.config import Settings, get_settings

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class StoredObject:
    bucket: str
    key: str

    @property
    def uri(self) -> str:
        return f"s3://{self.bucket}/{self.key}"


class ObjectStore:
    """S3-compatible storage, lazily connected."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None
        self._bucket_ready = False

    def _get_client(self):
        if self._client is None:
            import boto3
            from botocore.config import Config

            self._client = boto3.client(
                "s3",
                endpoint_url=self._settings.s3_endpoint_url,
                aws_access_key_id=self._settings.s3_access_key,
                aws_secret_access_key=self._settings.s3_secret_key,
                region_name=self._settings.s3_region,
                config=Config(
                    signature_version="s3v4",
                    # MinIO does not do virtual-host addressing on localhost.
                    s3={"addressing_style": "path"},
                    retries={"max_attempts": 2, "mode": "standard"},
                    connect_timeout=5,
                    read_timeout=30,
                ),
            )
        return self._client

    def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        client = self._get_client()
        bucket = self._settings.s3_bucket
        try:
            client.head_bucket(Bucket=bucket)
        except Exception:
            # Created on first use rather than in a setup script, so a fresh
            # machine needs no extra step.
            client.create_bucket(Bucket=bucket)
        self._bucket_ready = True

    def _put(self, key: str, data: bytes, content_type: str) -> StoredObject:
        self._ensure_bucket()
        self._get_client().put_object(
            Bucket=self._settings.s3_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return StoredObject(bucket=self._settings.s3_bucket, key=key)

    async def put(
        self, *, workspace_id: str, data: bytes, filename: str, content_type: str
    ) -> StoredObject | None:
        """Archive a file. Returns None when storage is unavailable.

        Keyed by content hash so re-uploading the same PDF overwrites rather than
        accumulating copies, and prefixed by workspace so a bucket listing never
        mixes tenants.
        """
        digest = hashlib.sha256(data).hexdigest()[:32]
        suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
        key = f"{workspace_id}/{digest}.{suffix}"

        try:
            # boto3 is synchronous; a 40MB upload would otherwise block the loop.
            return await asyncio.to_thread(self._put, key, data, content_type)
        except Exception as exc:
            log.warning("object_store_unavailable", error=str(exc)[:200], key=key)
            return None


_store: ObjectStore | None = None


def get_object_store() -> ObjectStore:
    global _store
    if _store is None:
        _store = ObjectStore(get_settings())
    return _store
