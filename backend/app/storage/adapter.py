import abc
import hashlib
import io
import os
from typing import BinaryIO, Optional, Tuple
import boto3
from botocore.client import Config
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

class S3CompatibleStorageAdapter(StorageAdapter):
    def __init__(self):
        self.bucket = settings.S3_BUCKET_NAME
        
        # Configure client for MinIO or AWS S3
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
            # AWS S3 with IAM role or standard AWS credentials
            self.s3_client = boto3.client("s3", region_name=settings.AWS_REGION)

        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
        except Exception:
            try:
                self.s3_client.create_bucket(Bucket=self.bucket)
            except Exception as e:
                # In restricted environments, bucket might already be provisioned
                pass

    def upload_file(self, object_key: str, data: BinaryIO, content_type: str = "application/octet-stream") -> Tuple[str, int]:
        hasher = hashlib.sha256()
        total_bytes = 0
        
        # Compute SHA-256 while streaming
        buffer = bytearray(64 * 1024)
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
        sink = io.BytesIO()
        actual_hash = self.download_file(object_key, sink)
        return actual_hash.lower() == expected_hash.lower()

    def delete_file(self, object_key: str) -> bool:
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=object_key)
            return True
        except Exception:
            return False

def get_storage_adapter() -> StorageAdapter:
    return S3CompatibleStorageAdapter()
