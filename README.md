# Videxo examples

Small runnable projects that take a video through [Videxo](https://videxo.io), the hosted FFmpeg
API, in the stack you already use. Each server example does the same four things and keeps your API
key on the server:

1. Create a job from a JSON body: one MP4 (`POST /v1/transcode`), or an MP4, a poster and a GIF
   preview in one job (`POST /v1/jobs`).
2. Receive the job's webhook and verify its signature.
3. Upload a file from the browser with a one-time upload URL.
4. Download the outputs through a fresh signed link.

| Folder | Stack | Guide |
|---|---|---|
| [`curl/`](curl/) | Shell commands for every call | [curl](https://videxo.io/docs/integrations/curl) |
| [`express/`](express/) | Node with Express | [Express](https://videxo.io/docs/integrations/express) |
| [`nextjs/`](nextjs/) | React with Next.js (App Router) | [Next.js](https://videxo.io/docs/integrations/nextjs) |
| [`sveltekit/`](sveltekit/) | SvelteKit | [SvelteKit](https://videxo.io/docs/integrations/sveltekit) |
| [`python-fastapi/`](python-fastapi/) | Python with FastAPI and `httpx` | [FastAPI](https://videxo.io/docs/integrations/python-fastapi) |
| [`go/`](go/) | Go, `net/http` | [Go](https://videxo.io/docs/integrations/go) |
| [`php/`](php/) | PHP without a framework | [PHP](https://videxo.io/docs/integrations/php) |
| [`laravel/`](laravel/) | Additions to a Laravel 12 app | [Laravel](https://videxo.io/docs/integrations/laravel) |
| [`rails/`](rails/) | Additions to a Rails 8 app | [Rails](https://videxo.io/docs/integrations/rails) |
| [`swift/`](swift/) | An iOS app (SwiftUI) that talks to any server example | [Swift](https://videxo.io/docs/integrations/swift) |
| [`kotlin/`](kotlin/) | An Android app (Compose) that talks to any server example | [Kotlin](https://videxo.io/docs/integrations/kotlin) |

## Run one

1. [Sign up](https://videxo.io/sign-up) and create an API key in the dashboard under **API keys**.
2. Open a folder and follow its README. The server examples read `VIDEXO_API_KEY` and
   `VIDEXO_WEBHOOK_SECRET` from the environment; `.env.example` lists the names. Never commit the
   values.

The JSON bodies of the jobs are in each folder's `requests/` and are the same in every stack. The
[API reference](https://videxo.io/docs/api) lists every field.

## Check a webhook route

`scripts/check-webhook-limit.ts` sends signed test events to a running server example: a body of
exactly 2 MiB must be accepted (204) and one byte more refused (413), with `Content-Length` and
with chunked transfer. It needs Node 22.18 or newer and the server's webhook secret, but no API key:

```bash
WEBHOOK_URL="http://localhost:3000/webhooks/videxo" VIDEXO_WEBHOOK_SECRET="<the server's secret>" \
  node scripts/check-webhook-limit.ts
```

## Questions and problems

The [docs](https://videxo.io/docs) cover the API; [Get help](https://videxo.io/docs/support) lists
the ways to reach us. Open an issue here for a problem with an example; fixes are made at the
source, so pull requests are closed with thanks ([CONTRIBUTING.md](CONTRIBUTING.md)).

## License

MIT, see [LICENSE](LICENSE).
