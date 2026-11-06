"""Deterministic matching between disruption entity IDs and graph elements."""
from __future__ import annotations

import ast
from collections.abc import Iterable
from typing import Any


EDGE_ID_FIELDS = ("entity_id", "edge_id", "facility_id", "elevator_id", "ref")
NODE_ID_FIELDS = ("entity_id", "node_id", "facility_id", "elevator_id", "ref")


def normalize_entity_id(value: Any) -> str:
    return str(value).strip().casefold()


def normalize_blocked_entities(values: Iterable[Any]) -> frozenset[str]:
    return frozenset(normalized for value in values if (normalized := normalize_entity_id(value)))


def _identity_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [item for nested in value for item in _identity_values(nested)]
    if isinstance(value, str):
        raw = value.strip()
        if raw.startswith("[") and raw.endswith("]"):
            try:
                parsed = ast.literal_eval(raw)
            except (SyntaxError, ValueError):
                parsed = None
            if isinstance(parsed, (list, tuple, set)):
                return _identity_values(parsed)
    normalized = normalize_entity_id(value)
    return [normalized] if normalized else []


def edge_entity_ids(u: Any, v: Any, key: Any, data: dict[str, Any]) -> frozenset[str]:
    identities = {normalize_entity_id(f"edge:{u}:{v}:{key}")}
    for field in EDGE_ID_FIELDS:
        identities.update(_identity_values(data.get(field)))
    for value in _identity_values(data.get("osmid")):
        identities.add(f"osm:{value}")
    return frozenset(identities)


def node_entity_ids(node: Any, data: dict[str, Any]) -> frozenset[str]:
    identities = {normalize_entity_id(f"node:{node}")}
    for field in NODE_ID_FIELDS:
        identities.update(_identity_values(data.get(field)))
    for value in _identity_values(data.get("osmid")):
        identities.add(f"osm:{value}")
    return frozenset(identities)


def edge_is_blocked(
    blocked: frozenset[str], u: Any, v: Any, key: Any, data: dict[str, Any]
) -> bool:
    return bool(blocked.intersection(edge_entity_ids(u, v, key, data)))


def node_is_blocked(blocked: frozenset[str], node: Any, data: dict[str, Any]) -> bool:
    return bool(blocked.intersection(node_entity_ids(node, data)))
