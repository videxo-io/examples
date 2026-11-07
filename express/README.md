# Videxo with Express

A small Express app that keeps the API key on the server and shows four things:

1. create a job from JSON: `POST /v1/transcode` (one MP4) or `POST /v1/jobs` (an MP4, a poster and
   a GIF preview in one job), each with an idempotency key;
2. receive the webhook and verify its signature with `@videxo/sdk` over the raw body;
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
| `src/videxo.ts` | Every call to the Videxo API, with `@videxo/sdk`, and the webhook check. |
| `src/app.ts` | The routes: uploads, jobs, downloads, client tokens for an app, the webhook and the error handler. |
| `src/server.ts` | Starts the server. |
| `public/index.html` | The page: upload, create, follow the job, download. |
| `requests/*.json` | The JSON bodies of the two jobs. |

## Client tokens for an app

`POST /api/client-tokens` and `POST /api/client-tokens/jobs` serve an app that holds a client token.
They refuse everyone with `401` until you replace `currentUser` in `src/app.ts` with your own sign-in,
and they mint only for the chain of the user who asks.

## The SDK

Every call goes through [`@videxo/sdk`](https://www.npmjs.com/package/@videxo/sdk), the TypeScript
client of the API ([docs](https://videxo.io/docs/sdk)), and `src/videxo.ts` is the only file that
imports it. Each function there is one call (`videxo.transcode()`, `videxo.jobs.create()`,
`videxo.uploads.create()`, `videxo.outputs.url()`, `verifyWebhook()`); the SDK retries a request
when a retry is safe, and an error answer of the API comes back as a `VidexoProblem` with its
problem details.
