"""Download, load, inspect, validate and snap coordinates to an OSM graph."""
from __future__ import annotations
from pathlib import Path
from datetime import datetime, timezone
import math
import networkx as nx


def validate_lat_lon(latitude: float, longitude: float) -> None:
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise ValueError("Coordinates must be finite numbers")
    if not -90 <= latitude <= 90:
        raise ValueError("Latitude must be between -90 and 90")
    if not -180 <= longitude <= 180:
        raise ValueError("Longitude must be between -180 and 180")


def download_walking_graph(place: str,
                           output: str = "data/campus.graphml") -> nx.MultiDiGraph:
    if not place.strip():
        raise ValueError("place cannot be empty")
    import osmnx as ox
    print(f"Geocoding: {place}")
    boundary = ox.geocode_to_gdf(place)
    if boundary.empty:
        raise RuntimeError(f"No boundary found for {place!r}")
    print("Downloading pedestrian network from OpenStreetMap...")
    graph = ox.graph_from_polygon(boundary.geometry.iloc[0], network_type="walk",
                                  simplify=True, retain_all=True)
    if not isinstance(graph, nx.MultiDiGraph):
        raise TypeError(f"Expected MultiDiGraph, got {type(graph).__name__}")
    downloaded_at = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    graph.graph["routing_graph_version"] = f"osm-{downloaded_at}"
    graph.graph["osm_downloaded_at"] = downloaded_at
    graph.graph["routing_source"] = "OpenStreetMap via OSMnx"
    graph.graph["place_query"] = place
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    ox.save_graphml(graph, path)
    print_graph_summary(graph)
    print(f"Saved graph: {path}")
    return graph


def load_graph(path: str = "data/campus.graphml") -> nx.MultiDiGraph:
    graph_path = Path(path)
    if not graph_path.is_file():
        raise FileNotFoundError(f"Graph file not found: {graph_path}. Run scripts/download_graph.py first.")
    try:
        # OSM node IDs are integers. Preserving that type lets OSMnx use its
        # spatial index after the GraphML artifact is reloaded from S3.
        graph = nx.read_graphml(graph_path, node_type=int, edge_key_type=int,
                                force_multigraph=True)
    except ValueError:
        # Keep generic/synthetic GraphML files usable when their IDs are not
        # numeric. snap_coordinate falls back to a deterministic linear scan.
        graph = nx.read_graphml(graph_path, force_multigraph=True)
    if not isinstance(graph, nx.MultiDiGraph):
        raise TypeError("Loaded graph is not a NetworkX MultiDiGraph")
    if graph.number_of_nodes() == 0 or graph.number_of_edges() == 0:
        raise ValueError("Loaded graph is empty")
    for node, data in graph.nodes(data=True):
        if "x" not in data or "y" not in data:
            raise ValueError(f"Graph node {node!r} is missing x/y coordinates")
    return graph


def print_graph_summary(graph: nx.MultiDiGraph) -> None:
    print("\n========== GRAPH SUMMARY ==========")
    print("Type:", type(graph).__name__)
    print("Nodes:", graph.number_of_nodes())
    print("Directed edges:", graph.number_of_edges())
    print("CRS:", graph.graph.get("crs", "unknown"))
    print("Graph version:", graph.graph.get("routing_graph_version", "unspecified"))


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2-lat1), math.radians(lon2-lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * radius * math.asin(math.sqrt(a))


def snap_coordinate(graph: nx.MultiDiGraph, latitude: float, longitude: float,
                    max_snap_distance_m: float = 50.0) -> dict:
    """Snap WGS84 coordinates to nearest graph node and enforce a distance cap.

    Downloaded OSMnx graphs are WGS84 (EPSG:4326). Reject projected graphs here
    rather than accidentally interpreting metres as longitude/latitude.
    """
    validate_lat_lon(latitude, longitude)
    if not math.isfinite(max_snap_distance_m) or max_snap_distance_m <= 0:
        raise ValueError("max_snap_distance_m must be a positive finite number")
    crs = str(graph.graph.get("crs", "EPSG:4326")).upper()
    if "4326" not in crs and "WGS 84" not in crs:
        raise ValueError(f"Expected an unprojected WGS84 graph; found CRS {crs!r}. Re-download or reproject it.")
    # OSMnx is the fast spatial-indexed path in production. The fallback keeps
    # synthetic unit tests independent of OSMnx and is O(number of graph nodes).
    try:
        import osmnx as ox
        if not all(isinstance(candidate, int) for candidate in graph.nodes):
            raise TypeError("OSMnx nearest_nodes requires integer OSM node IDs")
        node = ox.distance.nearest_nodes(graph, X=longitude, Y=latitude)
    except (ImportError, TypeError):
        node = min(graph.nodes, key=lambda n: haversine_m(
            latitude, longitude, float(graph.nodes[n]["y"]), float(graph.nodes[n]["x"])))
    node_data = graph.nodes[node]
    distance = haversine_m(latitude, longitude, float(node_data["y"]), float(node_data["x"]))
    result = {
        "node_id": node,
        "requested": {"latitude": latitude, "longitude": longitude},
        "snapped": {"latitude": float(node_data["y"]), "longitude": float(node_data["x"])},
        "distance_m": round(distance, 2),
        "within_limit": distance <= max_snap_distance_m,
        "max_distance_m": float(max_snap_distance_m),
    }
    if distance > max_snap_distance_m:
        raise ValueError(
            f"SNAP_DISTANCE_EXCEEDED: nearest network node is {distance:.1f} m away "
            f"(limit {max_snap_distance_m:.1f} m). Select a point closer to a mapped path."
        )
    return result
