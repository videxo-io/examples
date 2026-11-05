"""The app's routes: the page in public/ uploads a file straight to Videxo with an upload URL this
server makes, then asks the server to create a job and reads it until it ends. Videxo calls
/webhooks/videxo when the job ends. The API key and the webhook secret never leave the server."""

import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from standardwebhooks.webhooks import WebhookVerificationError

from . import videxo

app = FastAPI()
PUBLIC = Path(__file__).resolve().parent.parent / "public"

# Webhook ids already handled. Keep them in your database (a unique column) so a retry is skipped
# after a restart too.
handled: set[str] = set()


def on_job_ended(event: dict[str, Any]) -> None:
    # Your code: mark the order done, store the outputs' names, email the customer.
    print(event["type"], event["data"]["id"], [output["filename"] for output in event["data"]["outputs"]])


# snippet:start errors
@app.exception_handler(videxo.VidexoProblem)
async def videxo_problem(_request: Request, error: videxo.VidexoProblem) -> JSONResponse:
    # Videxo's problem details go to the page as they came, so it can show `detail` and the field errors.
    return JSONResponse(error.problem, status_code=error.status, media_type="application/problem+json")
# snippet:end errors


def bad_request(detail: str) -> videxo.VidexoProblem:
    """The problem details this app answers for a request it refuses itself."""
    return videxo.VidexoProblem(
        {"type": "about:blank", "title": "The request is not valid.", "status": 400, "detail": detail, "code": "invalid_request"}
    )


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(PUBLIC / "index.html")


# snippet:start upload-route
@app.post("/api/uploads", status_code=201)
async def create_upload(request: Request) -> dict[str, str]:
    body = await request.json()
    upload = await videxo.create_upload(body.get("filename"), body.get("size_bytes"), body.get("content_type"))
    # Only the one-time URL goes to the browser; it holds no API key.
    return {"input_url": upload["input_url"], "upload_url": upload["upload_url"]}
# snippet:end upload-route


# snippet:start create-route
UPLOAD = re.compile(r"^videxo://uploads/(up_[a-f0-9]{24})$")


@app.post("/api/jobs", status_code=202)
async def create_job(request: Request) -> dict[str, Any]:
    body = await request.json()
    input_url = body.get("input_url")
    # Accept only uploads, so nobody can make this server fetch URLs of their choice.
    match = UPLOAD.match(input_url) if isinstance(input_url, str) else None
    if not match:
        raise bad_request("input_url must be the input_url of an upload.")
    upload = match.group(1)
    # The same key for the same upload and kind: a retried request answers the same job, never a second one.
    if body.get("kind") == "jobs":
        return await videxo.create_job(input_url, f"jobs-{upload}")
    return await videxo.transcode(input_url, f"transcode-{upload}")
# snippet:end create-route


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str) -> dict[str, Any]:
    return await videxo.get_job(job_id)


# snippet:start download-route
@app.get("/api/jobs/{job_id}/outputs/{alias}")
async def download(job_id: str, alias: str) -> RedirectResponse:
    # A fresh link each time: signed links expire within an hour.
    return RedirectResponse(await videxo.output_url(job_id, alias), status_code=302)
# snippet:end download-route


# snippet:start webhook
# A webhook body is the whole job: up to several hundred KB, so 2 MB leaves room.
MAX_WEBHOOK_BYTES = 2 * 1024 * 1024


async def read_limited(request: Request, limit: int) -> bytes | None:
    """The raw body, or None when it is longer than `limit` bytes; never reads more than `limit` + 1."""
    length = request.headers.get("content-length")
    if length is not None and length.isdigit() and int(length) > limit:
        return None
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > limit:
            return None
    return bytes(body)


@app.post("/webhooks/videxo")
async def webhook(request: Request) -> Response:
    body = await read_limited(request, MAX_WEBHOOK_BYTES)
    if body is None:
        return Response(status_code=413)
    try:
        event = videxo.verify_webhook(body, dict(request.headers))
    # The library raises ValueError, not its own error, for a webhook-signature that is not "v1,<base64>".
    except (WebhookVerificationError, ValueError):
        return Response(status_code=400)
    webhook_id = request.headers["webhook-id"]
    if webhook_id not in handled:
        handled.add(webhook_id)
        on_job_ended(event)
    # Answer 2xx within seconds; do slow work in a queue of your own (FastAPI's BackgroundTasks, a worker).
    return Response(status_code=204)
# snippet:end webhook
