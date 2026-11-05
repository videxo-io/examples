# Videxo with Express

A small Express app that keeps the API key on the server and shows four things:

1. create a job from JSON: `POST /v1/transcode` (one MP4) or `POST /v1/jobs` (an MP4, a poster and
   a GIF preview in one job), each with an idempotency key;
2. receive the webhook and verify its signature with
   [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) over the raw body;
3. upload a file from the browser with a one-time upload URL the server creates;
4. download the outputs through a fresh signed link (`GET /v1/jobs/{id}/outputs/{alias}`).

Errors from the API are problem details (`application/problem+json`); the server passes them to
the page, which shows the detail and the field errors.

Docs: https://videxo.io/docs/integrations/express

## Run it

Node 22.18 or newer (it runs the TypeScript files directly).

```bash
cp .env.example .env    # fill in VIDEXO_API_KEY and VIDEXO_WEBHOOK_SECRET
npm install
npm run dev             # http://localhost:3000
```

Webhooks need a public `https` URL: run a tunnel (for example `cloudflared tunnel --url
http://localhost:3000`) and set `VIDEXO_WEBHOOK_URL` to its address plus `/webhooks/videxo`.
Without it, the page still follows the job by reading it every 2 seconds.

## Files

| File | What it does |
|---|---|
| `src/videxo.ts` | Every call to the Videxo API, with `fetch`, and the webhook check. |
| `src/app.ts` | The routes: uploads, jobs, downloads, the webhook and the error handler. |
| `src/server.ts` | Starts the server. |
| `public/index.html` | The page: upload, create, follow the job, download. |
| `requests/*.json` | The JSON bodies of the two jobs. |

## Switch to the SDK

`@videxo/sdk` is not on npm yet. Once it is, `src/videxo.ts` is the only file to change: each
function becomes one call (`videxo.transcode()`, `videxo.jobs.create()`, `videxo.uploads.create()`,
`videxo.outputs.url()`, `verifyWebhook()`), and the rest of the app stays as it is.
