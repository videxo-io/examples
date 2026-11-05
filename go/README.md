# Videxo with Go

A small Go server on `net/http` that keeps the API key on the server and shows four things:

1. create a job from JSON: `POST /v1/transcode` (one MP4) or `POST /v1/jobs` (an MP4, a poster and
   a GIF preview in one job), each with an idempotency key;
2. receive the webhook and verify its signature with the
   [Standard Webhooks library for Go](https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries/go)
   over the raw body;
3. upload a file from the browser with a one-time upload URL the server creates;
4. download the outputs through a fresh signed link (`GET /v1/jobs/{id}/outputs/{alias}`).

Errors from the API are problem details (`application/problem+json`); the server passes them to
the page, which shows the detail and the field errors.

Docs: https://videxo.io/docs/integrations/go

## Run it

Go 1.24 or newer.

```bash
export VIDEXO_API_KEY=...          # from the dashboard's API keys page
export VIDEXO_WEBHOOK_SECRET=...   # from the dashboard's Webhooks page
go run .                           # http://localhost:3000
```

Webhooks need a public `https` URL: run a tunnel (for example `cloudflared tunnel --url
http://localhost:3000`) and set `VIDEXO_WEBHOOK_URL` to its address plus `/webhooks/videxo`.
Without it, the page still follows the job by reading it every 2 seconds.

## Files

| File | What it does |
|---|---|
| `videxo.go` | Every call to the Videxo API, with `net/http`, and the webhook check. |
| `main.go` | The routes: uploads, jobs, downloads, the webhook and the problem details answer. |
| `public/index.html` | The page, embedded in the binary: upload, create, follow the job, download. |
| `requests/*.json` | The JSON bodies of the two jobs, embedded in the binary. |
