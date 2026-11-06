"""Door-to-door journeys across Chennai transit and the SRM walking graph."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from typing import Any

import networkx as nx

from .accessibility import evaluate_edge
from .graph import haversine_m, snap_coordinate
from .router import route_candidates
from .service import RouteRequestError, _integer, _number
from .status import edge_is_blocked, node_is_blocked, normalize_blocked_entities
from .transit import Ride, TransitNetwork


IST = timezone(timedelta(hours=5, minutes=30))
MODES = ("bus", "metro", "rail")
MODE_SETS = (("bus", "metro", "rail"), ("metro", "rail"), ("bus", "metro"), ("bus",))
WALK_DETOUR = 1.3
MAX_ACCESS_WALK_M = 1500.0
CAMPUS_SNAP_M = 100.0


@dataclass(frozen=True)
class Point:
    name: str
    lat: float
    lon: float

    def payload(self) -> dict[str, Any]:
        return {"name": self.name, "latitude": self.lat, "longitude": self.lon}


@dataclass(frozen=True)
class WalkLink:
    distance_m: float
    source: str


def _clock(value: int) -> str:
    value %= 86_400
    return f"{value // 3600:02d}:{value % 3600 // 60:02d}"


def _point_from(payload: Any, name: str) -> Point:
    if not isinstance(payload, dict):
        raise RouteRequestError(f"{name} must be an object")
    label = payload.get("name")
    return Point(
        label if isinstance(label, str) and label.strip() else name.title(),
        _number(payload.get("latitude"), f"{name}.latitude", minimum=-90, maximum=90),
        _number(payload.get("longitude"), f"{name}.longitude", minimum=-180, maximum=180),
    )


def _departure(value: Any) -> datetime:
    if value is None:
        return datetime.now(IST)
    if not isinstance(value, str):
        raise RouteRequestError("departure_time must be an ISO 8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RouteRequestError("departure_time must be an ISO 8601 string") from exc
    if parsed.tzinfo is None:
        raise RouteRequestError("departure_time must include a timezone")
    return parsed.astimezone(IST)


class CampusWalker:
    """Measure walking inside the SRM graph instead of estimating it."""

    def __init__(self, graph: nx.MultiDiGraph, wheelchair: bool, blocked: frozenset[str], speed_mps: float) -> None:
        self.graph = graph
        self.wheelchair = wheelchair
        self.blocked = blocked
        self.speed_mps = speed_mps

    def locate(self, lat: float, lon: float) -> tuple[Any, float] | None:
        try:
            snapped = snap_coordinate(self.graph, lat, lon, CAMPUS_SNAP_M)
        except ValueError:
            return None
        return snapped["node_id"], float(snapped["distance_m"])

    def distances(self, node: Any, *, towards: bool) -> dict[Any, float]:
        graph = self.graph.reverse(copy=False) if towards else self.graph

        def weight(u: Any, v: Any, edges: dict[Any, dict[str, Any]]) -> float | None:
            source, target = (v, u) if towards else (u, v)
            if node_is_blocked(self.blocked, v, graph.nodes[v]):
                return None
            lengths = [
                float(data["length"]) for key, data in edges.items()
                if not edge_is_blocked(self.blocked, source, target, key, data)
                and evaluate_edge(data, wheelchair_user=self.wheelchair, unknown_policy="relaxed")[0]
            ]
            return min(lengths) if lengths else None

        return nx.single_source_dijkstra_path_length(graph, node, weight=weight)

    def path(self, start: Any, goal: Any) -> list[list[float]] | None:
        routes = route_candidates(
            self.graph, start, goal,
            wheelchair_user=self.wheelchair, unknown_policy="relaxed",
            max_walking_m=10_000, walking_speed_mps=self.speed_mps, max_routes=1,
            blocked_entity_ids=self.blocked,
        )
        return routes[0]["geometry"]["coordinates"] if routes else None


class JourneyPlanner:
    def __init__(self, network: TransitNetwork, campus_graph: nx.MultiDiGraph | None = None,
                 graph_version: str | None = None) -> None:
        self.network = network
        self.campus_graph = campus_graph
        self.graph_version = graph_version

    def plan(self, payload: Any, *, blocked_entity_ids: Any = (), status_overlay: dict | None = None) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise RouteRequestError("request body must be a JSON object")
        profile = payload.get("profile", {})
        constraints = payload.get("constraints", {})
        if not isinstance(profile, dict) or not isinstance(constraints, dict):
            raise RouteRequestError("profile and constraints must be objects")
        origin = _point_from(payload.get("origin"), "origin")
        destination = _point_from(payload.get("destination"), "destination")
        departure = _departure(payload.get("departure_time"))
        speed = _number(profile.get("walking_speed_mps", 1.0), "walking_speed_mps", minimum=0.05)
        max_walk = _number(constraints.get("max_walking_distance_m", 2000), "max_walking_distance_m", minimum=0)
        max_routes = _integer(constraints.get("max_routes", 3), "max_routes", minimum=1, maximum=5)
        policy = profile.get("unknown_accessibility_policy", "relaxed")
        if policy not in {"strict", "relaxed"}:
            raise RouteRequestError("unknown_accessibility_policy must be 'strict' or 'relaxed'")
        wheelchair = profile.get("wheelchair_user", False)
        if not isinstance(wheelchair, bool):
            raise RouteRequestError("wheelchair_user must be a boolean")
        modes = constraints.get("modes", list(MODES))
        if not isinstance(modes, list) or not modes or any(mode not in MODES for mode in modes):
            raise RouteRequestError("modes must list bus, metro or rail")

        request_id = str(payload.get("request_id") or "") or None
        base = {
            "request_id": request_id,
            "status_overlay": status_overlay or {"active_events": 0, "blocking_events": 0, "blocked_entity_ids": []},
            "transit": {"sources": self.network.sources},
        }
        if wheelchair and policy == "strict":
            return {**base, "status": "no_route", "journeys": [], "message": (
                "The Chennai bus, metro and suburban feeds publish no wheelchair-boarding data, so no "
                "journey can be verified. Turn off strict verification to see unverified options."
            )}

        blocked = normalize_blocked_entities(blocked_entity_ids)
        walker = CampusWalker(self.campus_graph, wheelchair, blocked, speed) if self.campus_graph is not None else None
        seconds_now = departure.hour * 3600 + departure.minute * 60 + departure.second
        day_bit = 1 << departure.weekday()
        access = self._links(origin, walker, max_walk, towards=False)
        egress = self._links(destination, walker, max_walk, towards=True)

        journeys: dict[str, dict[str, Any]] = {}
        direct = self._direct(origin, destination, walker, seconds_now, speed, max_walk, wheelchair)
        if direct:
            journeys[direct["journey_id"]] = direct
        if access and egress:
            access_seconds = {stop: int(link.distance_m / speed) for stop, link in access.items()}
            egress_seconds = {stop: int(link.distance_m / speed) for stop, link in egress.items()}
            for mode_set in MODE_SETS:
                allowed = [mode for mode in mode_set if mode in modes]
                if not allowed:
                    continue
                for itinerary in self.network.search(
                    access_seconds, egress_seconds, seconds_now, day_bit, allowed, speed,
                ):
                    journey = self._journey(
                        itinerary, origin, destination, access, egress, walker, speed, wheelchair,
                    )
                    if journey["metrics"]["walking_distance_m"] <= max_walk:
                        journeys.setdefault(journey["journey_id"], journey)

        ordered = sorted(journeys.values(), key=lambda item: (
            item["metrics"]["arrival_s"], item["metrics"]["transfers"],
        ))[:max_routes]
        for journey in ordered:
            journey["metrics"].pop("arrival_s")
        return {
            **base,
            "status": "ok" if ordered else "no_route",
            "journeys": ordered,
            "message": None if ordered else (
                "No journey fits this departure time and walking limit. Try a later time or a higher walking limit."
            ),
        }

    def _links(self, point: Point, walker: CampusWalker | None, max_walk: float, *, towards: bool) -> dict[int, WalkLink]:
        radius = min(max_walk / WALK_DETOUR, MAX_ACCESS_WALK_M)
        nearby = self.network.nearby_stops(point.lat, point.lon, radius)
        located = walker.locate(point.lat, point.lon) if walker else None
        reachable = walker.distances(located[0], towards=towards) if walker and located else {}
        links: dict[int, WalkLink] = {}
        for stop_index, straight in nearby:
            stop = self.network.stops[stop_index]
            snapped = walker.locate(stop.lat, stop.lon) if reachable and walker else None
            if snapped and snapped[0] in reachable:
                links[stop_index] = WalkLink(reachable[snapped[0]] + snapped[1] + located[1], "campus_graph")
            else:
                links[stop_index] = WalkLink(straight * WALK_DETOUR, "estimated")
        return links

    def _walk_leg(self, start: Point, end: Point, link: WalkLink, walker: CampusWalker | None,
                  speed: float, departure: int) -> dict[str, Any]:
        geometry = [[start.lon, start.lat], [end.lon, end.lat]]
        if link.source == "campus_graph" and walker:
            first, second = walker.locate(start.lat, start.lon), walker.locate(end.lat, end.lon)
            if first and second and first[0] != second[0]:
                geometry = walker.path(first[0], second[0]) or geometry
        duration = int(link.distance_m / speed)
        return {
            "mode": "walk",
            "from": start.payload(),
            "to": end.payload(),
            "departure": _clock(departure),
            "arrival": _clock(departure + duration),
            "duration_min": round(duration / 60, 1),
            "distance_m": round(link.distance_m, 1),
            "walk_source": link.source,
            "fare_inr": 0,
            "geometry": geometry,
        }

    def _ride_leg(self, ride: Ride) -> dict[str, Any]:
        pattern = self.network.patterns[ride.pattern]
        short_name, long_name, mode = self.network.routes[pattern.route]
        indices = pattern.stops[ride.board:ride.alight + 1]
        stops = [self.network.stops[index] for index in indices]
        departure = pattern.times[ride.board][ride.trip]
        arrival = pattern.times[ride.alight][ride.trip]
        distance = sum(haversine_m(a.lat, a.lon, b.lat, b.lon) for a, b in zip(stops, stops[1:]))
        fare = self.network.metro_fare(indices[0], indices[-1]) if mode == "metro" else None
        return {
            "mode": mode,
            "from": Point(stops[0].name, stops[0].lat, stops[0].lon).payload(),
            "to": Point(stops[-1].name, stops[-1].lat, stops[-1].lon).payload(),
            "departure": _clock(departure),
            "arrival": _clock(arrival),
            "duration_min": round((arrival - departure) / 60, 1),
            "distance_m": round(distance, 1),
            "route_name": short_name or long_name,
            "route_description": long_name,
            "stop_count": len(stops) - 1,
            "fare_inr": fare,
            "geometry": [[stop.lon, stop.lat] for stop in stops],
            "_departure_s": departure,
            "_arrival_s": arrival,
        }

    def _stop_point(self, index: int) -> Point:
        stop = self.network.stops[index]
        return Point(stop.name, stop.lat, stop.lon)

    def _journey(self, itinerary: Any, origin: Point, destination: Point, access: dict[int, WalkLink],
                 egress: dict[int, WalkLink], walker: CampusWalker | None, speed: float,
                 wheelchair: bool) -> dict[str, Any]:
        rides = [self._ride_leg(value) for kind, value in itinerary.steps if kind == "ride"]
        first_link = access[itinerary.access_stop]
        leave = rides[0]["_departure_s"] - int(first_link.distance_m / speed) - 60
        legs = [self._walk_leg(origin, self._stop_point(itinerary.access_stop), first_link, walker, speed, leave)]
        ride_position = 0
        for kind, value in itinerary.steps:
            if kind == "ride":
                legs.append(rides[ride_position])
                ride_position += 1
            else:
                start, end, distance = value
                legs.append(self._walk_leg(
                    self._stop_point(start), self._stop_point(end), WalkLink(distance, "estimated"),
                    None, speed, legs[-1].get("_arrival_s", 0),
                ))
        arrival_at_stop = rides[-1]["_arrival_s"]
        last_steps = itinerary.steps[-1]
        if last_steps[0] == "walk":
            arrival_at_stop += int(last_steps[1][2] / speed)
        legs.append(self._walk_leg(
            self._stop_point(itinerary.egress_stop), destination, egress[itinerary.egress_stop],
            walker, speed, arrival_at_stop,
        ))
        legs = [leg for leg in legs if leg["mode"] != "walk" or leg["distance_m"] >= 1]
        signature = [[leg["mode"], leg.get("route_name"), leg["from"]["name"], leg["to"]["name"]] for leg in rides]
        for leg in legs:
            leg.pop("_departure_s", None)
            leg.pop("_arrival_s", None)
        return self._summary(legs, signature, leave, itinerary.arrival, len(rides) - 1, wheelchair)

    def _direct(self, origin: Point, destination: Point, walker: CampusWalker | None, now: int,
                speed: float, max_walk: float, wheelchair: bool) -> dict[str, Any] | None:
        straight = haversine_m(origin.lat, origin.lon, destination.lat, destination.lon)
        link = WalkLink(straight * WALK_DETOUR, "estimated")
        if walker:
            first, second = walker.locate(origin.lat, origin.lon), walker.locate(destination.lat, destination.lon)
            if first and second:
                measured = walker.distances(first[0], towards=False).get(second[0])
                if measured is not None:
                    link = WalkLink(measured + first[1] + second[1], "campus_graph")
        if link.distance_m > max_walk:
            return None
        leg = self._walk_leg(origin, destination, link, walker, speed, now)
        return self._summary([leg], [["walk", None, origin.name, destination.name]],
                             now, now + int(link.distance_m / speed), 0, wheelchair)

    def _summary(self, legs: list[dict[str, Any]], signature: list[Any], leave: int, arrival: int,
                 transfers: int, wheelchair: bool) -> dict[str, Any]:
        transit_legs = [leg for leg in legs if leg["mode"] != "walk"]
        unknown_fares = sorted({leg["mode"] for leg in transit_legs if leg["fare_inr"] is None})
        known_fare = sum(leg["fare_inr"] for leg in legs if leg["fare_inr"] is not None)
        walking = sum(leg["distance_m"] for leg in legs if leg["mode"] == "walk")
        notes: list[str] = []
        if any(leg["mode"] == "metro" for leg in legs):
            notes.append("Metro times are a typical schedule: the published CMRL timetable ended in 2021.")
        if unknown_fares:
            names = {"bus": "MTC bus", "rail": "suburban rail", "metro": "metro"}
            notes.append("Fares are not published in the " + " and ".join(names[mode] for mode in unknown_fares)
                         + " data, so the total is incomplete.")
        if any(leg.get("walk_source") == "estimated" for leg in legs):
            notes.append("Walking outside the SRM campus is estimated from straight-line distance.")
        warnings = ["Wheelchair access is unverified: these feeds publish no boarding accessibility data."] \
            if wheelchair and transit_legs else []
        identity = json.dumps(signature, separators=(",", ":"))
        return {
            "journey_id": hashlib.sha1(identity.encode()).hexdigest()[:12],
            "departure": _clock(leave),
            "arrival": _clock(arrival),
            "metrics": {
                "duration_min": round((arrival - leave) / 60, 1),
                "walking_distance_m": round(walking, 1),
                "transfers": max(transfers, 0),
                "arrival_s": arrival,
            },
            "fare": {"known_inr": known_fare, "complete": not unknown_fares, "unknown_modes": unknown_fares},
            "modes": sorted({leg["mode"] for leg in legs}),
            "legs": legs,
            "accessibility": {"status": "uncertain", "wheelchair_profile": wheelchair, "warnings": warnings},
            "notes": notes,
        }
