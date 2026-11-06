import networkx as nx
import pytest
from routing.accessibility import classify_edge, evaluate_edge
from routing.graph import load_graph, snap_coordinate
from routing.router import route_candidates
from routing.service import RoutingService, RouteRequestError


def small_graph():
    g = nx.MultiDiGraph()
    g.graph.update(crs="EPSG:4326", routing_graph_version="test-v1", routing_source="synthetic test")
    g.add_node(1, x=0.0, y=0.0)
    g.add_node(2, x=0.001, y=0.0)
    g.add_node(3, x=0.002, y=0.0)
    g.add_edge(1, 2, key=0, length=111.2, wheelchair="yes")
    g.add_edge(2, 3, key=0, length=111.2, wheelchair="yes")
    g.add_edge(1, 3, key=0, length=230.0)  # unknown
    return g


def test_graphml_load_does_not_require_osmnx(tmp_path):
    graph_path = tmp_path / "routing.graphml"
    nx.write_graphml(small_graph(), graph_path)

    loaded = load_graph(str(graph_path))

    assert isinstance(loaded, nx.MultiDiGraph)
    assert loaded.graph["routing_graph_version"] == "test-v1"
    assert loaded.number_of_nodes() == 3
    assert loaded.number_of_edges() == 3


def test_accessibility_policy():
    assert classify_edge({"highway": "steps"}) == "INACCESSIBLE"
    assert evaluate_edge({}, unknown_policy="strict")[0] is False
    assert evaluate_edge({}, unknown_policy="relaxed")[0] is True


def test_multilabel_route_and_geojson():
    g = small_graph()
    routes = route_candidates(g, 1, 3, unknown_policy="relaxed", max_walking_m=500)
    assert routes
    assert routes[0]["geometry"]["type"] == "LineString"
    assert routes[0]["metrics"]["walking_distance_m"] > 0
    assert routes[0]["edges"]


def test_service_rejects_far_snap():
    service = RoutingService(small_graph())
    payload = {"origin": {"latitude": 1, "longitude": 1},
               "destination": {"latitude": 0, "longitude": 0},
               "constraints": {"max_snap_distance_m": 20}}
    with pytest.raises(RouteRequestError, match="SNAP_DISTANCE_EXCEEDED"):
        service.route(payload)


def test_service_response_contract():
    service = RoutingService(small_graph())
    payload = {"request_id": "test-123",
               "origin": {"latitude": 0, "longitude": 0},
               "destination": {"latitude": 0, "longitude": 0.002},
               "profile": {"wheelchair_user": True, "unknown_accessibility_policy": "relaxed"},
               "constraints": {"max_snap_distance_m": 30, "max_walking_distance_m": 500}}
    response = service.route(payload)
    assert response["request_id"] == "test-123"
    assert response["status"] == "ok"
    assert "snapped_points" in response
    assert response["routes"][0]["route_id"]
    assert response["status_overlay"] == {
        "active_events": 0,
        "blocking_events": 0,
        "blocked_entity_ids": [],
    }


def test_active_disruption_excludes_exactly_matched_edge():
    graph = small_graph()
    graph.edges[1, 2, 0]["elevator_id"] = "lift-a1"

    routes = route_candidates(
        graph,
        1,
        3,
        unknown_policy="relaxed",
        max_walking_m=500,
        blocked_entity_ids={"LIFT-A1"},
    )

    assert len(routes) == 1
    assert routes[0]["metrics"]["walking_distance_m"] == 230.0
    assert routes[0]["edges"][0]["from"] == 1
    assert routes[0]["edges"][0]["to"] == 3


def test_blocked_origin_or_destination_returns_no_route():
    assert route_candidates(
        small_graph(),
        1,
        3,
        unknown_policy="relaxed",
        blocked_entity_ids={"node:3"},
    ) == []
