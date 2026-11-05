"""Every call this app makes to the Videxo API, with httpx. It is the only module that talks to
Videxo, and it runs on the server only: it reads the API key."""

import json
import os
from pathlib import Path
from typing import Any

import httpx
from standardwebhooks.webhooks import Webhook

API_URL = os.environ.get("VIDEXO_API_URL", "https://api.videxo.io")
REQUESTS = Path(__file__).resolve().parent.parent / "requests"

# The request bodies sit in requests/, next to the code.
TRANSCODE_BODY: dict[str, Any] = json.loads((REQUESTS / "transcode.json").read_text())
JOBS_BODY: dict[str, Any] = json.loads((REQUESTS / "jobs.json").read_text())


# snippet:start request
class VidexoProblem(Exception):
    """An error answer of the API: RFC 9457 problem details. Branch on `code`; show `detail` to people."""

    def __init__(self, problem: dict[str, Any]) -> None:
        super().__init__(f"{problem.get('code')}: {problem.get('detail')}")
        self.problem = problem
        self.status: int = problem.get("status", 500)


_client = httpx.AsyncClient(base_url=API_URL, timeout=60)


async def _request(method: str, path: str, body: Any = None, idempotency_key: str | None = None) -> httpx.Response:
    api_key = os.environ.get("VIDEXO_API_KEY")
    if not api_key:
        raise RuntimeError("Set VIDEXO_API_KEY in the server environment.")
    headers = {"Authorization": f"Bearer {api_key}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    # httpx does not follow redirects unless asked: the download route reads the Location itself.
    response = await _client.request(method, path, json=body, headers=headers)
    if response.status_code >= 400:
        try:
            problem = response.json()
        except ValueError:
            problem = None
        if not isinstance(problem, dict) or "code" not in problem:
            # Not problem details: a proxy or the network answered, not the API.
            problem = {
                "type": "about:blank",
                "title": "The API answered with an error.",
                "status": response.status_code,
                "detail": f"HTTP {response.status_code}",
                "code": "http_error",
            }
        raise VidexoProblem(problem)
    return response


async def _json(method: str, path: str, body: Any = None, idempotency_key: str | None = None) -> dict[str, Any]:
    data: dict[str, Any] = (await _request(method, path, body, idempotency_key)).json()
    return data
# snippet:end request


def _webhook() -> dict[str, str]:
    """Where Videxo sends the job's webhook: a public https URL of this app (a tunnel in development)."""
    url = os.environ.get("VIDEXO_WEBHOOK_URL")
    return {"webhook_url": url} if url else {}


# snippet:start create
async def transcode(input_url: str, idempotency_key: str) -> dict[str, Any]:
    """One MP4 from one input: POST /v1/transcode with the body in requests/transcode.json."""
    body = {**TRANSCODE_BODY, "input": input_url, **_webhook()}
    return await _json("POST", "/v1/transcode", body, idempotency_key)


async def create_job(input_url: str, idempotency_key: str) -> dict[str, Any]:
    """Several outputs from one input in one job: POST /v1/jobs with the body in requests/jobs.json."""
    body = {**JOBS_BODY, "inputs": {"talk": input_url}, **_webhook()}
    return await _json("POST", "/v1/jobs", body, idempotency_key)
# snippet:end create


async def get_job(job_id: str) -> dict[str, Any]:
    return await _json("GET", f"/v1/jobs/{job_id}")


# snippet:start upload
async def create_upload(filename: str, size_bytes: int, content_type: str) -> dict[str, Any]:
    """A one-time upload URL for a file the browser sends straight to Videxo; the API key stays here."""
    body = {"filename": filename, "size_bytes": size_bytes, "content_type": content_type}
    return await _json("POST", "/v1/uploads", body)
# snippet:end upload


# snippet:start download
async def output_url(job_id: str, alias: str) -> str:
    """A fresh signed link to one output, from the redirect of GET /v1/jobs/{id}/outputs/{alias}."""
    response = await _request("GET", f"/v1/jobs/{job_id}/outputs/{alias}")
    return response.headers["location"]
# snippet:end download


# snippet:start verify
def verify_webhook(body: bytes, headers: dict[str, str]) -> dict[str, Any]:
    """The event when the request is a webhook Videxo signed, in the last five minutes; it raises
    WebhookVerificationError otherwise. `body` is the raw body exactly as received: parsed and
    serialized again, it no longer matches the signature."""
    secret = os.environ.get("VIDEXO_WEBHOOK_SECRET")
    if not secret:
        raise RuntimeError("Set VIDEXO_WEBHOOK_SECRET in the server environment.")
    event: dict[str, Any] = Webhook(secret).verify(body, headers)
    return event
# snippet:end verify
