"""Tests for DynamoDB Stream notification translation."""

from boto3.dynamodb.types import TypeSerializer

from backend.event_publisher_lambda.handler import handle_records


_serializer = TypeSerializer()


def _image(status="ACTIVE"):
    item = {
        "pk": "EVENT#event-1",
        "sk": "EVENT",
        "entityType": "DISRUPTION",
        "eventId": "e3f6c068-a1ba-4dc1-a15b-fd15631a2632",
        "entityId": "lift-a1",
        "entityName": "Elevator A1",
        "stationName": "Central Station",
        "type": "elevator_outage",
        "severity": "critical",
        "reason": "Elevator unavailable",
        "effectiveStart": "2026-11-06T10:00:00Z",
        "affectedLinesOrStops": ["Blue Line"],
        "impactOnAccessibility": "Step-free access unavailable",
        "status": status,
        "createdAt": "2026-11-06T10:00:00Z",
        "updatedAt": "2026-11-06T10:05:00Z",
    }
    return {key: _serializer.serialize(value) for key, value in item.items()}


def _record(event_name, image, event_id="delivery-1"):
    return {
        "eventID": event_id,
        "eventName": event_name,
        "dynamodb": {"NewImage": image},
    }


class FakePublisher:
    def __init__(self):
        self.messages = []

    def publish(self, messages):
        self.messages.extend(messages)
        return len(messages)


def test_insert_and_resolve_records_become_idempotent_notifications():
    publisher = FakePublisher()
    records = [
        _record("INSERT", _image(), "delivery-create"),
        _record("MODIFY", _image("RESOLVED"), "delivery-resolve"),
    ]

    result = handle_records(records, publisher)

    assert result == {"records": 2, "notifications": 2, "published": 2}
    assert publisher.messages[0]["deliveryId"] == "delivery-create"
    assert publisher.messages[0]["eventType"] == "DISRUPTION_CREATED"
    assert publisher.messages[0]["event"]["isActive"] is True
    assert publisher.messages[1]["eventType"] == "DISRUPTION_RESOLVED"
    assert publisher.messages[1]["event"]["isActive"] is False


def test_non_disruption_and_remove_records_are_ignored():
    publisher = FakePublisher()
    other = _image()
    other["entityType"] = _serializer.serialize("OTHER")

    result = handle_records(
        [_record("INSERT", other), _record("REMOVE", _image(), "delivery-remove")],
        publisher,
    )

    assert result == {"records": 2, "notifications": 0, "published": 0}
    assert publisher.messages == []
