import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from backend.event_publisher_lambda.handler import handle_records
from backend.event_publisher_lambda.tests.test_event_publisher_handler import (
    FakePublisher,
    _image,
    _record,
)


ROOT = Path(__file__).resolve().parents[3]


def _schema(name):
    return json.loads((ROOT / "contracts" / name).read_text(encoding="utf-8"))


def test_stream_notification_matches_shared_contract():
    publisher = FakePublisher()
    handle_records([_record("INSERT", _image())], publisher)
    notification_schema = _schema("disruption-notification.schema.json")
    event_schema = _schema("disruption-event.schema.json")
    event_schema["allOf"][0] = _schema("disruption-create.schema.json")
    notification_schema["properties"]["event"] = event_schema

    Draft202012Validator(
        notification_schema,
        format_checker=FormatChecker(),
    ).validate(publisher.messages[0])
