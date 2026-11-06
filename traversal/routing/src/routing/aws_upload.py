"""Build safe AWS CLI commands for graph artifact publication."""
from __future__ import annotations

from pathlib import Path, PurePosixPath
import re


_BUCKET_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")


def build_upload_commands(
    *, bucket: str, object_key: str, graph_path: str | Path,
    manifest_path: str | Path, profile: str | None = None,
    region: str | None = None,
) -> list[list[str]]:
    if not _BUCKET_PATTERN.fullmatch(bucket):
        raise ValueError("Invalid S3 bucket name")
    key = PurePosixPath(object_key)
    if key.is_absolute() or ".." in key.parts or key.suffix != ".graphml":
        raise ValueError("object_key must be a safe relative .graphml key")
    if profile is not None and (not profile.strip() or profile.startswith("-")):
        raise ValueError("Invalid AWS profile name")
    if region is not None and (not region.strip() or region.startswith("-")):
        raise ValueError("Invalid AWS region")

    common = ["--only-show-errors"]
    if profile:
        common.extend(["--profile", profile])
    if region:
        common.extend(["--region", region])
    graph_uri = f"s3://{bucket}/{key.as_posix()}"
    manifest_uri = f"s3://{bucket}/{key.with_suffix('.manifest.json').as_posix()}"
    return [
        ["aws", "s3", "cp", str(Path(graph_path)), graph_uri, *common],
        ["aws", "s3", "cp", str(Path(manifest_path)), manifest_uri, *common],
    ]
