"""Verify and publish the routing graph and manifest to the CDK graph bucket."""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from routing.artifacts import load_build_config, verify_manifest
from routing.aws_upload import build_upload_commands


ROUTING_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True, help="GraphBucketName CDK output")
    parser.add_argument("--profile", help="AWS CLI profile created for EzPath")
    parser.add_argument("--region", help="AWS deployment region")
    parser.add_argument("--config", type=Path, default=ROUTING_ROOT / "config" / "campus.json")
    parser.add_argument("--graph", type=Path, default=ROUTING_ROOT / "data" / "campus.graphml")
    parser.add_argument("--manifest", type=Path, default=ROUTING_ROOT / "data" / "campus.manifest.json")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="perform the upload; without this flag the commands are only printed",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_build_config(args.config)
    verify_manifest(args.graph, args.manifest)
    commands = build_upload_commands(
        bucket=args.bucket,
        object_key=config["graph_object_key"],
        graph_path=args.graph,
        manifest_path=args.manifest,
        profile=args.profile,
        region=args.region,
    )
    for command in commands:
        print(subprocess.list2cmdline(command))
    if not args.execute:
        print("Dry run only. Add --execute after reviewing the bucket, profile, and region.")
        return
    for command in commands:
        subprocess.run(command, check=True)
    print("Graph artifact and manifest uploaded successfully.")


if __name__ == "__main__":
    main()
