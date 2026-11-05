# Videxo with SvelteKit

A small SvelteKit app that keeps the API key in server code and shows four things:

1. create a job from JSON in a form action: `POST /v1/transcode` (one MP4) or `POST /v1/jobs` (an
   MP4, a poster and a GIF preview in one job), each with an idempotency key;
2. receive the webhook in a `+server.ts` and verify its signature with
   [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) over the raw body;
3. upload a file from the browser with a one-time upload URL the server creates;
4. download the outputs through a fresh signed link (`GET /v1/jobs/{id}/outputs/{alias}`).

Errors from the API are problem details (`application/problem+json`); the action and the endpoints
pass them to the page, which shows the detail and the field errors.

Docs: https://videxo.io/docs/integrations/sveltekit

## Run it

Node 22.17 or newer (SvelteKit 3).

```bash
cp .env.example .env    # fill in VIDEXO_API_KEY and VIDEXO_WEBHOOK_SECRET
npm install
npm run dev             # http://localhost:5173
```

Webhooks need a public `https` URL: run a tunnel (for example `cloudflared tunnel --url
http://localhost:5173`) and set `VIDEXO_WEBHOOK_URL` to its address plus `/webhooks/videxo`.
Without it, the page still follows the job by reading it every 2 seconds.

The built server is `npm run build`, then `node --env-file=.env build`: `node build` alone does
not read `.env`. It refuses request bodies over 512 KB unless `BODY_SIZE_LIMIT` says otherwise; a
webhook carries the whole job, so `.env.example` sets 2 MB. It takes every request as `https`, as
behind a TLS proxy, so on plain `http://localhost` it refuses the page's form as cross-site (403);
try the app locally with `npm run dev`.

## Files

| File | What it does |
|---|---|
| `src/lib/server/videxo.ts` | Every call to the Videxo API, with `fetch`, and the webhook check. Server only. |
| `src/lib/server/respond.ts` | Problem details answers of the endpoints. |
| `src/lib/server/limited-body.ts` | Reads the webhook's raw body, refusing one over 2 MB. |
| `src/env.ts` | The environment variables, read through `$app/env/private`. |
| `src/routes/+page.server.ts` | The form action that creates the job from an upload. |
| `src/routes/+page.svelte` | The page: upload from the browser, submit, follow the job, download. |
| `src/routes/api/uploads/+server.ts` | Creates a one-time upload URL for the browser. |
| `src/routes/api/jobs/[id]/+server.ts` | Reads the job. |
| `src/routes/api/jobs/[id]/outputs/[alias]/+server.ts` | Redirects to a fresh signed link of an output. |
| `src/routes/webhooks/videxo/+server.ts` | Receives and verifies the webhook. |
| `requests/*.json` | The JSON bodies of the two jobs. |

## Switch to the SDK

`@videxo/sdk` is not on npm yet. Once it is, `src/lib/server/videxo.ts` is the only file to change:
each function becomes one call (`videxo.transcode()`, `videxo.jobs.create()`,
`videxo.uploads.create()`, `videxo.outputs.url()`, `verifyWebhook()`), and the rest of the app stays
as it is.
