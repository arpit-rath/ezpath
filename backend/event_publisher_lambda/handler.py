"""Publish disruption-table changes to the AppSync Events channel."""
from __future__ import annotations

import logging
import os
from typing import Any

from boto3.dynamodb.types import TypeDeserializer

try:
    from .publisher import AppSyncEventPublisher
except ImportError:  # Lambda copies adapter modules to the task root.
    from publisher import AppSyncEventPublisher


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)
_publisher: AppSyncEventPublisher | None = None
_deserializer = TypeDeserializer()


def _deserialize_image(image: dict[str, Any]) -> dict[str, Any]:
    return {key: _deserializer.deserialize(value) for key, value in image.items()}


def _event_from_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["eventId"],
        "entityId": item["entityId"],
        "entityName": item["entityName"],
        **({"stationName": item["stationName"]} if item.get("stationName") else {}),
        "type": item["type"],
        "severity": item["severity"],
        "reason": item["reason"],
        "effectiveStart": item["effectiveStart"],
        **(
            {"estimatedResolution": item["estimatedResolution"]}
            if item.get("estimatedResolution")
            else {}
        ),
        "affectedLinesOrStops": item.get("affectedLinesOrStops", []),
        "impactOnAccessibility": item["impactOnAccessibility"],
        "isActive": item.get("status") == "ACTIVE",
    }


def _notification(record: dict[str, Any]) -> dict[str, Any] | None:
    if record.get("eventName") not in {"INSERT", "MODIFY"}:
        return None
    image = record.get("dynamodb", {}).get("NewImage")
    if not image:
        return None
    item = _deserialize_image(image)
    if item.get("entityType") != "DISRUPTION":
        return None
    delivery_id = record.get("eventID")
    if not isinstance(delivery_id, str) or not delivery_id:
        raise ValueError("DynamoDB Stream record is missing eventID")
    if record["eventName"] == "INSERT":
        event_type = "DISRUPTION_CREATED"
    elif item.get("status") == "RESOLVED":
        event_type = "DISRUPTION_RESOLVED"
    else:
        event_type = "DISRUPTION_UPDATED"
    return {
        "deliveryId": delivery_id,
        "eventType": event_type,
        "occurredAt": item.get("updatedAt") or item.get("createdAt"),
        "event": _event_from_item(item),
    }


def handle_records(records: list[dict[str, Any]], publisher: Any) -> dict[str, int]:
    notifications = [message for record in records if (message := _notification(record)) is not None]
    published = publisher.publish(notifications) if notifications else 0
    return {"records": len(records), "notifications": len(notifications), "published": published}


def _get_publisher() -> AppSyncEventPublisher:
    global _publisher
    if _publisher is None:
        _publisher = AppSyncEventPublisher(
            os.environ.get("EZPATH_APPSYNC_HTTP_DNS", ""),
            os.environ.get("AWS_REGION", ""),
            os.environ.get("EZPATH_APPSYNC_CHANNEL", "/disruptions/network"),
        )
    return _publisher


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, int]:
    request_id = getattr(context, "aws_request_id", None)
    records = event.get("Records", [])
    LOGGER.info(
        "publishing disruption stream batch",
        extra={"aws_request_id": request_id, "record_count": len(records)},
    )
    return handle_records(records, _get_publisher())
