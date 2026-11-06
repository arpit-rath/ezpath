"""Framework-independent request/response boundary for backend integration."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import math
from .graph import snap_coordinate
from .router import route_candidates
from .status import normalize_blocked_entities


class RouteRequestError(ValueError):
    """Invalid request or coordinate snapping failure; safe to map to HTTP 400."""


@dataclass
class RoutingService:
    graph: Any
    graph_version: str | None = None

    def __post_init__(self) -> None:
        if self.graph_version is None:
            self.graph_version = str(self.graph.graph.get("routing_graph_version", "unspecified"))

    def route(self, payload: dict, *, blocked_entity_ids=(), status_overlay: dict | None = None) -> dict:
        """Accept the public JSON contract and return JSON-serializable data."""
        try:
            if not isinstance(payload, dict):
                raise RouteRequestError("request body must be a JSON object")
            request_id = str(payload.get("request_id") or "")
            origin = payload["origin"]
            destination = payload["destination"]
            profile = payload.get("profile", {})
            constraints = payload.get("constraints", {})
            if not isinstance(origin, dict) or not isinstance(destination, dict):
                raise RouteRequestError("origin and destination must be objects")
            if not isinstance(profile, dict) or not isinstance(constraints, dict):
                raise RouteRequestError("profile and constraints must be objects")
            max_snap = _number(constraints.get("max_snap_distance_m", 50), "max_snap_distance_m", minimum=0.001)
            max_walk = _number(constraints.get("max_walking_distance_m", 3000), "max_walking_distance_m", minimum=0)
            speed = _number(profile.get("walking_speed_mps", 1.0), "walking_speed_mps", minimum=0.05)
            max_routes = _integer(constraints.get("max_routes", 3), "max_routes", minimum=1, maximum=10)
            unknown_policy = profile.get("unknown_accessibility_policy", "strict")
            if unknown_policy not in {"strict", "relaxed"}:
                raise RouteRequestError("unknown_accessibility_policy must be 'strict' or 'relaxed'")
            wheelchair = profile.get("wheelchair_user", True)
            if not isinstance(wheelchair, bool):
                raise RouteRequestError("wheelchair_user must be a boolean")
            origin_snap = snap_coordinate(self.graph,
                _number(origin.get("latitude"), "origin.latitude", minimum=-90, maximum=90),
                _number(origin.get("longitude"), "origin.longitude", minimum=-180, maximum=180), max_snap)
            destination_snap = snap_coordinate(self.graph,
                _number(destination.get("latitude"), "destination.latitude", minimum=-90, maximum=90),
                _number(destination.get("longitude"), "destination.longitude", minimum=-180, maximum=180), max_snap)
            routes = route_candidates(self.graph, origin_snap["node_id"], destination_snap["node_id"],
                wheelchair_user=wheelchair, unknown_policy=unknown_policy,
                max_walking_m=max_walk, walking_speed_mps=speed, max_routes=max_routes,
                blocked_entity_ids=blocked_entity_ids)
            normalized_blocked = sorted(normalize_blocked_entities(blocked_entity_ids))
            overlay = {
                "active_events": 0,
                "blocking_events": 0,
                "blocked_entity_ids": normalized_blocked,
            }
            if status_overlay:
                overlay.update(status_overlay)
                overlay["blocked_entity_ids"] = normalized_blocked
            return {
                "request_id": request_id or None,
                "status": "ok" if routes else "no_route",
                "graph": {"version": self.graph_version, "source": self.graph.graph.get("routing_source", "unknown"),
                          "crs": str(self.graph.graph.get("crs", "unknown"))},
                "snapped_points": {"origin": origin_snap, "destination": destination_snap},
                "routes": routes,
                "status_overlay": overlay,
                "message": None if routes else "No route satisfies the supplied constraints and accessibility policy.",
            }
        except RouteRequestError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            raise RouteRequestError(str(exc)) from exc


def _number(value: Any, name: str, *, minimum: float | None = None,
            maximum: float | None = None) -> float:
    if isinstance(value, bool):
        raise RouteRequestError(f"{name} must be numeric")
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise RouteRequestError(f"{name} must be numeric")
    if not math.isfinite(result):
        raise RouteRequestError(f"{name} must be finite")
    if minimum is not None and result < minimum:
        raise RouteRequestError(f"{name} must be >= {minimum}")
    if maximum is not None and result > maximum:
        raise RouteRequestError(f"{name} must be <= {maximum}")
    return result


def _integer(value: Any, name: str, *, minimum: int, maximum: int) -> int:
    number = _number(value, name, minimum=minimum, maximum=maximum)
    if not number.is_integer():
        raise RouteRequestError(f"{name} must be an integer")
    return int(number)
