"""Build the versioned SRM walking graph and its integrity manifest."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

import osmnx as ox

from routing.artifacts import (
    build_manifest,
    load_and_validate_locations,
    load_build_config,
    validate_routing_graph,
    verify_manifest,
    write_manifest,
)
from routing.graph import load_graph, print_graph_summary


ROUTING_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROUTING_ROOT / "config" / "campus.json"
DEFAULT_LOCATIONS = ROUTING_ROOT / "config" / "campus-locations.json"
DEFAULT_GRAPH = ROUTING_ROOT / "data" / "campus.graphml"
DEFAULT_MANIFEST = ROUTING_ROOT / "data" / "campus.manifest.json"
DEFAULT_CACHE = ROUTING_ROOT / "cache"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--locations", type=Path, default=DEFAULT_LOCATIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_GRAPH)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--force", action="store_true", help="replace an existing graph")
    return parser.parse_args()


def build_graph(args: argparse.Namespace):
    config = load_build_config(args.config)
    if args.output.exists() and not args.force:
        graph = load_graph(str(args.output))
        validate_routing_graph(graph)
        if not args.manifest.exists():
            raise FileNotFoundError(
                f"Manifest not found: {args.manifest}. Rebuild with --force."
            )
        verify_manifest(args.output, args.manifest)
        print(f"Using existing verified graph: {args.output}")
        return graph, config

    ox.settings.use_cache = True
    ox.settings.cache_folder = DEFAULT_CACHE
    center = (
        float(config["center"]["latitude"]),
        float(config["center"]["longitude"]),
    )
    print(
        f"Downloading {config['network_type']} network around "
        f"{center} with radius {config['radius_m']} m..."
    )
    graph = ox.graph_from_point(
        center,
        dist=float(config["radius_m"]),
        network_type=config["network_type"],
        simplify=True,
        retain_all=True,
    )
    downloaded_at = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    graph.graph["routing_graph_id"] = config["graph_id"]
    graph.graph["routing_graph_version"] = f"osm-{downloaded_at}"
    graph.graph["osm_downloaded_at"] = downloaded_at
    graph.graph["routing_source"] = config["source"]
    graph.graph["routing_source_url"] = config["source_url"]
    graph.graph["routing_license"] = config["license"]
    graph.graph["coverage_center_lat"] = center[0]
    graph.graph["coverage_center_lon"] = center[1]
    graph.graph["coverage_radius_m"] = float(config["radius_m"])
    graph.graph["network_type"] = config["network_type"]
    validate_routing_graph(graph)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    ox.io.save_graphml(graph, filepath=args.output)
    print(f"Saved graph: {args.output}")
    return graph, config


def main() -> None:
    args = parse_args()
    graph, config = build_graph(args)
    catalog, snap_results = load_and_validate_locations(args.locations, graph)
    manifest = build_manifest(
        graph,
        args.output,
        config,
        location_count=len(catalog["locations"]),
    )
    write_manifest(manifest, args.manifest)
    verify_manifest(args.output, args.manifest)
    print_graph_summary(graph)
    print(f"Validated locations: {len(snap_results)}")
    print(f"Maximum catalog snap distance: {max(item['distance_m'] for item in snap_results):.2f} m")
    print(f"Saved manifest: {args.manifest}")


if __name__ == "__main__":
    main()
