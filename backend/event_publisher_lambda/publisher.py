"""SigV4-authenticated AppSync Events HTTP publisher."""
from __future__ import annotations

import json
from typing import Any, Callable
from urllib.request import Request, urlopen


MAX_EVENTS_PER_REQUEST = 5


def _default_signer(url: str, body: bytes, region: str) -> dict[str, str]:
    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest
    from botocore.session import get_session

    credentials = get_session().get_credentials()
    if credentials is None:
        raise RuntimeError("AWS credentials are unavailable for AppSync publishing")
    request = AWSRequest(
        method="POST",
        url=url,
        data=body,
        headers={"content-type": "application/json"},
    )
    SigV4Auth(credentials.get_frozen_credentials(), "appsync", region).add_auth(request)
    return dict(request.prepare().headers.items())


class AppSyncEventPublisher:
    def __init__(
        self,
        http_dns: str,
        region: str,
        channel: str,
        *,
        signer: Callable[[str, bytes, str], dict[str, str]] | None = None,
        opener: Callable[..., Any] | None = None,
    ) -> None:
        if not http_dns.strip():
            raise RuntimeError("EZPATH_APPSYNC_HTTP_DNS is required")
        if not region.strip():
            raise RuntimeError("AWS_REGION is required")
        if not channel.startswith("/") or len(channel.split("/")) < 3:
            raise RuntimeError("AppSync channel must include a namespace and channel path")
        endpoint = http_dns.strip().rstrip("/")
        if not endpoint.startswith(("https://", "http://")):
            endpoint = f"https://{endpoint}"
        self._url = endpoint if endpoint.endswith("/event") else f"{endpoint}/event"
        self._region = region
        self._channel = channel
        self._signer = signer or _default_signer
        self._opener = opener or urlopen

    def publish(self, messages: list[dict[str, Any]]) -> int:
        published = 0
        for start in range(0, len(messages), MAX_EVENTS_PER_REQUEST):
            batch = messages[start : start + MAX_EVENTS_PER_REQUEST]
            payload = {
                "channel": self._channel,
                "events": [json.dumps(message, separators=(",", ":"), sort_keys=True) for message in batch],
            }
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            headers = self._signer(self._url, body, self._region)
            request = Request(self._url, data=body, headers=headers, method="POST")
            with self._opener(request, timeout=5) as response:
                status = getattr(response, "status", None) or response.getcode()
                response_body = response.read().decode("utf-8")
            if status < 200 or status >= 300:
                raise RuntimeError(f"AppSync publish failed with HTTP {status}")
            try:
                result = json.loads(response_body) if response_body else {}
            except json.JSONDecodeError as exc:
                raise RuntimeError("AppSync publish returned invalid JSON") from exc
            if result.get("failed"):
                raise RuntimeError(f"AppSync rejected {len(result['failed'])} event(s)")
            published += len(batch)
        return published
