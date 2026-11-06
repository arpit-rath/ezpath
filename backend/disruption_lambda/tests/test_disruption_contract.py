import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from backend.disruption_lambda.handler import handle_event
from backend.disruption_lambda.tests.test_handler import FakeRepository, VALID_EVENT, _post


ROOT = Path(__file__).resolve().parents[3]
CREATE_PATH = ROOT / "contracts" / "disruption-create.schema.json"
EVENT_PATH = ROOT / "contracts" / "disruption-event.schema.json"


def _schema(path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def test_create_input_and_lambda_response_match_disruption_contracts():
    create_schema = _schema(CREATE_PATH)
    event_schema = _schema(EVENT_PATH)
    event_schema["allOf"][0] = create_schema

    Draft202012Validator(create_schema, format_checker=FormatChecker()).validate(VALID_EVENT)
    response = handle_event(_post("POST /v1/events", VALID_EVENT), FakeRepository())
    created = json.loads(response["body"])
    Draft202012Validator(
        event_schema,
        format_checker=FormatChecker(),
    ).validate(created)


def test_openapi_exposes_public_reads_and_operator_write_routes():
    text = (ROOT / "contracts" / "openapi.yaml").read_text(encoding="utf-8")

    assert "/v1/events/active:" in text
    assert "/v1/events/{eventId}/resolve:" in text
    assert "operatorJwt" in text
