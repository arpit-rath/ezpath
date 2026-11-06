import json

import networkx as nx
import pytest

from routing.artifacts import (
    build_manifest,
    load_and_validate_locations,
    load_build_config,
    verify_manifest,
    write_manifest,
)
from routing.aws_upload import build_upload_commands


def artifact_graph():
    graph = nx.MultiDiGraph()
    graph.graph.update(
        crs="EPSG:4326",
        routing_graph_id="test-campus",
        routing_graph_version="test-v1",
    )
    graph.add_node("a", x=80.0, y=12.0)
    graph.add_node("b", x=80.001, y=12.0)
    graph.add_edge("a", "b", key=0, length=108.8)
    return graph


def build_config():
    return {
        "schema_version": 1,
        "graph_id": "test-campus",
        "name": "Test campus",
        "center": {"latitude": 12.0, "longitude": 80.0},
        "radius_m": 1000,
        "network_type": "walk",
        "graph_object_key": "graphs/campus.graphml",
        "source": "Test source",
        "source_url": "https://example.test/source",
        "license": "Test license",
    }


def test_build_config_validation(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps(build_config()), encoding="utf-8")

    assert load_build_config(path)["graph_id"] == "test-campus"


def test_manifest_detects_modified_graph(tmp_path):
    graph = artifact_graph()
    graph_path = tmp_path / "campus.graphml"
    manifest_path = tmp_path / "campus.manifest.json"
    nx.write_graphml(graph, graph_path)
    manifest = build_manifest(graph, graph_path, build_config(), location_count=1)
    write_manifest(manifest, manifest_path)

    assert verify_manifest(graph_path, manifest_path)["statistics"]["nodes"] == 2
    graph_path.write_text(graph_path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="size does not match"):
        verify_manifest(graph_path, manifest_path)


def test_location_catalog_is_snapped_and_source_backed(tmp_path):
    catalog = {
        "schema_version": 1,
        "graph_id": "test-campus",
        "locations": [
            {
                "id": "library",
                "name": "Library",
                "latitude": 12.0,
                "longitude": 80.0,
                "source": {"type": "OpenStreetMap node", "id": "123"},
            }
        ],
    }
    path = tmp_path / "locations.json"
    path.write_text(json.dumps(catalog), encoding="utf-8")

    _, results = load_and_validate_locations(path, artifact_graph())

    assert results[0]["id"] == "library"
    assert results[0]["distance_m"] == 0.0


def test_location_catalog_rejects_disconnected_points(tmp_path):
    graph = artifact_graph()
    graph.add_node("c", x=81.0, y=12.0)
    graph.add_edge("c", "c", key=0, length=0.0)
    catalog = {
        "schema_version": 1,
        "graph_id": "test-campus",
        "locations": [
            {
                "id": "first",
                "name": "First",
                "latitude": 12.0,
                "longitude": 80.0,
                "source": {"type": "OpenStreetMap node", "id": "1"},
            },
            {
                "id": "second",
                "name": "Second",
                "latitude": 12.0,
                "longitude": 81.0,
                "source": {"type": "OpenStreetMap node", "id": "2"},
            },
        ],
    }
    path = tmp_path / "locations.json"
    path.write_text(json.dumps(catalog), encoding="utf-8")

    with pytest.raises(ValueError, match="strongly connected"):
        load_and_validate_locations(path, graph)


def test_upload_commands_use_versioned_bucket_keys(tmp_path):
    graph_path = tmp_path / "campus.graphml"
    manifest_path = tmp_path / "campus.manifest.json"
    commands = build_upload_commands(
        bucket="ezpath-graph-bucket-123",
        object_key="graphs/campus.graphml",
        graph_path=graph_path,
        manifest_path=manifest_path,
        profile="ezpath-dev",
        region="ap-south-1",
    )

    assert commands[0][:3] == ["aws", "s3", "cp"]
    assert commands[0][4] == "s3://ezpath-graph-bucket-123/graphs/campus.graphml"
    assert commands[1][4] == "s3://ezpath-graph-bucket-123/graphs/campus.manifest.json"
    assert "--profile" in commands[0]


@pytest.mark.parametrize("bucket", ["-bad", "BadBucket", "a", "bad_bucket"])
def test_upload_rejects_invalid_bucket(bucket, tmp_path):
    with pytest.raises(ValueError, match="bucket"):
        build_upload_commands(
            bucket=bucket,
            object_key="graphs/campus.graphml",
            graph_path=tmp_path / "campus.graphml",
            manifest_path=tmp_path / "campus.manifest.json",
        )
