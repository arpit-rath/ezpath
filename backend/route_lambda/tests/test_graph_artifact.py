from pathlib import Path

import pytest

from backend.route_lambda.graph_artifact import ensure_graph_artifact


class FakeS3Client:
    def __init__(self, content: bytes = b"graph-data"):
        self.content = content
        self.calls = []

    def download_file(self, bucket: str, key: str, filename: str) -> None:
        self.calls.append((bucket, key, filename))
        Path(filename).write_bytes(self.content)


def test_existing_graph_does_not_download(tmp_path):
    graph = tmp_path / "graph.graphml"
    graph.write_text("existing", encoding="utf-8")
    client = FakeS3Client()

    result = ensure_graph_artifact(str(graph), bucket="unused", key="unused", s3_client=client)

    assert result == str(graph)
    assert client.calls == []


def test_missing_graph_downloads_from_s3(tmp_path):
    graph = tmp_path / "nested" / "graph.graphml"
    client = FakeS3Client()

    result = ensure_graph_artifact(
        str(graph),
        bucket="ezpath-graphs",
        key="graphs/campus.graphml",
        s3_client=client,
    )

    assert result == str(graph)
    assert graph.read_bytes() == b"graph-data"
    assert client.calls == [("ezpath-graphs", "graphs/campus.graphml", str(graph))]


def test_missing_configuration_is_explicit(tmp_path):
    with pytest.raises(RuntimeError, match="ROUTING_GRAPH_UNAVAILABLE"):
        ensure_graph_artifact(str(tmp_path / "missing.graphml"), bucket=None, key=None)
