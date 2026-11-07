# Videxo with Next.js

A small Next.js app (App Router) that keeps the API key in route handlers and shows four things:

1. create a job from JSON: `POST /v1/transcode` (one MP4) or `POST /v1/jobs` (an MP4, a poster and
   a GIF preview in one job), each with an idempotency key;
2. receive the webhook and verify its signature with `@videxo/sdk` over the raw body;
3. upload a file from a client component with a one-time upload URL a route handler creates;
4. download the outputs through a fresh signed link (`GET /v1/jobs/{id}/outputs/{alias}`).

Errors from the API are problem details (`application/problem+json`); the route handlers pass them
to the page, which shows the detail and the field errors.

Docs: https://videxo.io/docs/integrations/nextjs

## Run it

Node 20.9 or newer.

```bash
cp .env.example .env.local    # fill in VIDEXO_API_KEY and VIDEXO_WEBHOOK_SECRET
npm install
npm run dev                   # http://localhost:3000
```

Webhooks need a public `https` URL: run a tunnel (for example `cloudflared tunnel --url
http://localhost:3000`) and set `VIDEXO_WEBHOOK_URL` to its address plus `/api/webhooks/videxo`.
Without it, the page still follows the job by reading it every 2 seconds.

## Files

| File | What it does |
|---|---|
| `lib/videxo.ts` | Every call to the Videxo API, with `@videxo/sdk`, and the webhook check. Server only. |
| `lib/respond.ts` | Problem details answers of the route handlers. |
| `lib/limited-body.ts` | Reads the webhook's raw body, refusing one over 2 MB. |
| `app/api/uploads/route.ts` | Creates a one-time upload URL for the browser. |
| `app/api/jobs/route.ts` | Creates the job from an upload. |
| `app/api/jobs/[id]/route.ts` | Reads the job. |
| `app/api/jobs/[id]/outputs/[alias]/route.ts` | Redirects to a fresh signed link of an output. |
| `app/api/webhooks/videxo/route.ts` | Receives and verifies the webhook. |
| `app/upload-form.tsx` | The client component: upload, create, follow the job, download. |
| `requests/*.json` | The JSON bodies of the two jobs. |

## The SDK

Every call goes through [`@videxo/sdk`](https://www.npmjs.com/package/@videxo/sdk), the TypeScript
client of the API ([docs](https://videxo.io/docs/sdk)), and `lib/videxo.ts` is the only file that
imports it. Each function there is one call (`videxo.transcode()`, `videxo.jobs.create()`,
`videxo.uploads.create()`, `videxo.outputs.url()`, `verifyWebhook()`); the SDK retries a request
when a retry is safe, and an error answer of the API comes back as a `VidexoProblem` with its
problem details.
