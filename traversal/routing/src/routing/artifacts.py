"""Build and verify reproducible routing graph artifacts."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import networkx as nx

from .graph import snap_coordinate, validate_lat_lon


def load_build_config(path: str | Path) -> dict[str, Any]:
    config_path = Path(path)
    config = json.loads(config_path.read_text(encoding="utf-8"))
    required = {
        "schema_version", "graph_id", "name", "center", "radius_m",
        "network_type", "graph_object_key", "source", "source_url", "license",
    }
    missing = sorted(required - config.keys())
    if missing:
        raise ValueError(f"Graph build config is missing: {', '.join(missing)}")
    if config["schema_version"] != 1:
        raise ValueError("Unsupported graph build config schema_version")
    if not str(config["graph_id"]).strip():
        raise ValueError("graph_id cannot be empty")
    center = config["center"]
    validate_lat_lon(float(center["latitude"]), float(center["longitude"]))
    radius_m = float(config["radius_m"])
    if not math.isfinite(radius_m) or radius_m <= 0:
        raise ValueError("radius_m must be a positive finite number")
    if config["network_type"] != "walk":
        raise ValueError("EzPath graph builds must use network_type='walk'")
    object_key = str(config["graph_object_key"])
    if object_key.startswith("/") or not object_key.endswith(".graphml"):
        raise ValueError("graph_object_key must be a relative .graphml key")
    return config


def validate_routing_graph(graph: nx.MultiDiGraph) -> dict[str, float]:
    if not isinstance(graph, nx.MultiDiGraph):
        raise TypeError(f"Expected MultiDiGraph, got {type(graph).__name__}")
    if graph.number_of_nodes() == 0 or graph.number_of_edges() == 0:
        raise ValueError("Routing graph cannot be empty")
    crs = str(graph.graph.get("crs", "")).upper()
    if "4326" not in crs and "WGS 84" not in crs:
        raise ValueError(f"Expected an unprojected WGS84 graph; found CRS {crs!r}")

    latitudes: list[float] = []
    longitudes: list[float] = []
    for node, data in graph.nodes(data=True):
        try:
            latitude = float(data["y"])
            longitude = float(data["x"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"Graph node {node!r} has invalid x/y coordinates") from error
        validate_lat_lon(latitude, longitude)
        latitudes.append(latitude)
        longitudes.append(longitude)

    for source, target, key, data in graph.edges(keys=True, data=True):
        try:
            length = float(data["length"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(
                f"Graph edge {(source, target, key)!r} has no valid length"
            ) from error
        if not math.isfinite(length) or length < 0:
            raise ValueError(f"Graph edge {(source, target, key)!r} has invalid length")

    return {
        "north": max(latitudes), "south": min(latitudes),
        "east": max(longitudes), "west": min(longitudes),
    }


def load_and_validate_locations(
    path: str | Path,
    graph: nx.MultiDiGraph,
    *,
    max_snap_distance_m: float = 100.0,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    catalog = json.loads(Path(path).read_text(encoding="utf-8"))
    if catalog.get("schema_version") != 1:
        raise ValueError("Unsupported location catalog schema_version")
    if catalog.get("graph_id") != graph.graph.get("routing_graph_id"):
        raise ValueError("Location catalog graph_id does not match the routing graph")
    locations = catalog.get("locations")
    if not isinstance(locations, list) or not locations:
        raise ValueError("Location catalog must contain at least one location")

    ids: set[str] = set()
    results: list[dict[str, Any]] = []
    for location in locations:
        location_id = str(location.get("id", "")).strip()
        if not location_id or location_id in ids:
            raise ValueError(f"Location id is empty or duplicated: {location_id!r}")
        ids.add(location_id)
        if not str(location.get("name", "")).strip():
            raise ValueError(f"Location {location_id!r} has no name")
        source = location.get("source")
        if not isinstance(source, dict) or not source.get("type") or not source.get("id"):
            raise ValueError(f"Location {location_id!r} has no source reference")
        result = snap_coordinate(
            graph,
            float(location["latitude"]),
            float(location["longitude"]),
            max_snap_distance_m=max_snap_distance_m,
        )
        results.append({"id": location_id, **result})

    component_by_node = {
        node: component_index
        for component_index, component in enumerate(nx.strongly_connected_components(graph))
        for node in component
    }
    catalog_components = {component_by_node[result["node_id"]] for result in results}
    if len(catalog_components) != 1:
        raise ValueError(
            "Location catalog points do not share one strongly connected walking component"
        )
    return catalog, results


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(
    graph: nx.MultiDiGraph,
    graph_path: str | Path,
    config: dict[str, Any],
    *,
    location_count: int,
) -> dict[str, Any]:
    graph_file = Path(graph_path)
    bounds = validate_routing_graph(graph)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    return {
        "schema_version": 1,
        "graph_id": config["graph_id"],
        "graph_version": graph.graph["routing_graph_version"],
        "generated_at": generated_at,
        "source": {
            "name": config["source"], "url": config["source_url"],
            "license": config["license"],
        },
        "coverage": {
            "center": config["center"], "radius_m": config["radius_m"],
            "network_type": config["network_type"], "bounds": bounds,
        },
        "artifact": {
            "file_name": graph_file.name,
            "object_key": config["graph_object_key"],
            "bytes": graph_file.stat().st_size,
            "sha256": sha256_file(graph_file),
        },
        "statistics": {
            "nodes": graph.number_of_nodes(),
            "directed_edges": graph.number_of_edges(),
            "locations": location_count,
            "strong_components": nx.number_strongly_connected_components(graph),
            "largest_strong_component_nodes": len(
                max(nx.strongly_connected_components(graph), key=len)
            ),
        },
        "crs": str(graph.graph["crs"]),
    }


def write_manifest(manifest: dict[str, Any], path: str | Path) -> None:
    manifest_path = Path(path)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def verify_manifest(graph_path: str | Path, manifest_path: str | Path) -> dict[str, Any]:
    graph_file = Path(graph_path)
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    artifact = manifest.get("artifact", {})
    if artifact.get("bytes") != graph_file.stat().st_size:
        raise ValueError("Graph artifact size does not match the manifest")
    if artifact.get("sha256") != sha256_file(graph_file):
        raise ValueError("Graph artifact SHA-256 does not match the manifest")
    return manifest
