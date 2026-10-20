import abc
import hashlib
import io
import os
import shutil
from typing import BinaryIO, Optional, Tuple
from backend.app.core.config import settings

class StorageAdapter(abc.ABC):
    @abc.abstractmethod
    def upload_file(self, object_key: str, data: BinaryIO, content_type: str = "application/octet-stream") -> Tuple[str, int]:
        """Uploads file to object storage and returns (sha256_hash, byte_size)"""
        pass

    @abc.abstractmethod
    def download_file(self, object_key: str, target_stream: BinaryIO) -> str:
        """Downloads file to target stream and returns calculated sha256_hash"""
        pass

    @abc.abstractmethod
    def verify_integrity(self, object_key: str, expected_hash: str) -> bool:
        """Verifies object storage contents match expected SHA-256 hash"""
        pass

    @abc.abstractmethod
    def delete_file(self, object_key: str) -> bool:
        """Removes object from storage"""
        pass

class LocalStorageAdapter(StorageAdapter):
    """File-system backed storage adapter for local dev, Render ephemeral tier, or tests"""
    def __init__(self, base_dir: str = "data/storage"):
        self.base_dir = os.path.abspath(base_dir)
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_path(self, object_key: str) -> str:
        # Prevent path traversal
        clean_key = os.path.normpath(object_key).lstrip(os.path.sep)
        return os.path.join(self.base_dir, clean_key)

    def upload_file(self, object_key: str, data: BinaryIO, content_type: str = "application/octet-stream") -> Tuple[str, int]:
        target_path = self._get_path(object_key)
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        hasher = hashlib.sha256()
        total_bytes = 0
        with open(target_path, "wb") as f:
            while True:
                chunk = data.read(64 * 1024)
                if not chunk:
                    break
                hasher.update(chunk)
                total_bytes += len(chunk)
                f.write(chunk)
        return hasher.hexdigest(), total_bytes

    def download_file(self, object_key: str, target_stream: BinaryIO) -> str:
        target_path = self._get_path(object_key)
        if not os.path.exists(target_path):
            raise FileNotFoundError(f"Storage object '{object_key}' does not exist")
        hasher = hashlib.sha256()
        with open(target_path, "rb") as f:
            while True:
                chunk = f.read(64 * 1024)
                if not chunk:
                    break
                hasher.update(chunk)
                target_stream.write(chunk)
        return hasher.hexdigest()

    def verify_integrity(self, object_key: str, expected_hash: str) -> bool:
        target_path = self._get_path(object_key)
        if not os.path.exists(target_path):
            return False
        hasher = hashlib.sha256()
        with open(target_path, "rb") as f:
            while True:
                chunk = f.read(64 * 1024)
                if not chunk:
                    break
                hasher.update(chunk)
        return hasher.hexdigest().lower() == expected_hash.lower()

    def delete_file(self, object_key: str) -> bool:
        target_path = self._get_path(object_key)
        try:
            if os.path.exists(target_path):
                os.remove(target_path)
            return True
        except Exception:
            return False

class S3CompatibleStorageAdapter(StorageAdapter):
    def __init__(self):
        self.bucket = settings.S3_BUCKET_NAME
        try:
            import boto3
            from botocore.client import Config
            if settings.STORAGE_BACKEND == "minio" or settings.S3_ENDPOINT_URL:
                self.s3_client = boto3.client(
                    "s3",
                    endpoint_url=settings.S3_ENDPOINT_URL,
                    aws_access_key_id=settings.S3_ACCESS_KEY,
                    aws_secret_access_key=settings.S3_SECRET_KEY,
                    config=Config(signature_version="s3v4"),
                    region_name=settings.AWS_REGION
                )
            else:
                self.s3_client = boto3.client("s3", region_name=settings.AWS_REGION)
            self._ensure_bucket_exists()
        except Exception as e:
            # Fallback to local storage if S3 credentials/connection fails
            self._fallback = LocalStorageAdapter()
            self.s3_client = None

    def _ensure_bucket_exists(self):
        if not self.s3_client:
            return
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
        except Exception:
            try:
                self.s3_client.create_bucket(Bucket=self.bucket)
            except Exception:
                pass

    def upload_file(self, object_key: str, data: BinaryIO, content_type: str = "application/octet-stream") -> Tuple[str, int]:
        if not self.s3_client:
            return self._fallback.upload_file(object_key, data, content_type)
        hasher = hashlib.sha256()
        total_bytes = 0
        temp_data = io.BytesIO()
        while True:
            chunk = data.read(64 * 1024)
            if not chunk:
                break
            hasher.update(chunk)
            total_bytes += len(chunk)
            temp_data.write(chunk)
        temp_data.seek(0)
        sha256_hex = hasher.hexdigest()
        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=object_key,
            Body=temp_data,
            ContentType=content_type,
            Metadata={"sha256": sha256_hex, "size": str(total_bytes)}
        )
        return sha256_hex, total_bytes

    def download_file(self, object_key: str, target_stream: BinaryIO) -> str:
        if not self.s3_client:
            return self._fallback.download_file(object_key, target_stream)
        hasher = hashlib.sha256()
        response = self.s3_client.get_object(Bucket=self.bucket, Key=object_key)
        stream = response["Body"]
        while True:
            chunk = stream.read(64 * 1024)
            if not chunk:
                break
            hasher.update(chunk)
            target_stream.write(chunk)
        return hasher.hexdigest()

    def verify_integrity(self, object_key: str, expected_hash: str) -> bool:
        if not self.s3_client:
            return self._fallback.verify_integrity(object_key, expected_hash)
        sink = io.BytesIO()
        actual_hash = self.download_file(object_key, sink)
        return actual_hash.lower() == expected_hash.lower()

    def delete_file(self, object_key: str) -> bool:
        if not self.s3_client:
            return self._fallback.delete_file(object_key)
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=object_key)
            return True
        except Exception:
            return False

def get_storage_adapter() -> StorageAdapter:
    if settings.STORAGE_BACKEND in ["s3", "minio"] and (settings.S3_ENDPOINT_URL or os.getenv("AWS_ACCESS_KEY_ID")):
        try:
            return S3CompatibleStorageAdapter()
        except Exception:
            return LocalStorageAdapter()
    return LocalStorageAdapter()
