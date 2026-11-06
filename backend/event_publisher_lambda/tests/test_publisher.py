import json

import pytest

from backend.event_publisher_lambda.publisher import AppSyncEventPublisher


class FakeResponse:
    def __init__(self, payload, status=200):
        self.payload = json.dumps(payload).encode("utf-8")
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def getcode(self):
        return self.status

    def read(self):
        return self.payload


def test_publisher_signs_and_batches_at_five_events():
    calls = []

    def signer(url, body, region):
        calls.append(("sign", url, json.loads(body), region))
        return {"content-type": "application/json", "authorization": "signed"}

    def opener(request, timeout):
        calls.append(("open", request, timeout))
        return FakeResponse({"successful": [{"identifier": "ok"}], "failed": []})

    publisher = AppSyncEventPublisher(
        "example.appsync-api.ap-south-1.amazonaws.com",
        "ap-south-1",
        "/disruptions/network",
        signer=signer,
        opener=opener,
    )

    assert publisher.publish([{"sequence": index} for index in range(6)]) == 6

    sign_calls = [call for call in calls if call[0] == "sign"]
    open_calls = [call for call in calls if call[0] == "open"]
    assert len(sign_calls) == 2
    assert len(sign_calls[0][2]["events"]) == 5
    assert len(sign_calls[1][2]["events"]) == 1
    assert sign_calls[0][1] == "https://example.appsync-api.ap-south-1.amazonaws.com/event"
    assert sign_calls[0][2]["channel"] == "/disruptions/network"
    assert open_calls[0][2] == 5


def test_publisher_raises_when_appsync_rejects_an_event():
    publisher = AppSyncEventPublisher(
        "https://example.test/event",
        "ap-south-1",
        "/disruptions/network",
        signer=lambda *_: {"content-type": "application/json"},
        opener=lambda *_args, **_kwargs: FakeResponse(
            {"successful": [], "failed": [{"index": 0, "errorType": "Unauthorized"}]}
        ),
    )

    with pytest.raises(RuntimeError, match="rejected 1 event"):
        publisher.publish([{"eventType": "DISRUPTION_CREATED"}])
