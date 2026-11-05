# Videxo with PHP

Plain PHP 8.2 or newer, cURL and Composer. One file per endpoint, with all Videxo calls in
`src/Videxo.php`. The browser uploads directly to Videxo, creates one MP4 or several outputs from
the JSON in `requests/`, polls the job and follows fresh download links. The API key stays here.
API errors reach the page as `application/problem+json`, with their status and field errors.

Docs: https://videxo.io/docs/integrations/php

## Run it

```bash
composer install
cp .env.example .env
# Fill in VIDEXO_API_KEY and VIDEXO_WEBHOOK_SECRET. Set VIDEXO_API_URL for a local API.
# The env file contains shell assignments; the PHP server reads exported variables.
set -a
. ./.env
set +a
# Set PORT to a free local port.
php -S "127.0.0.1:$PORT" -t public public/router.php
```

Open `http://127.0.0.1:$PORT`. The router maps the page's extensionless paths to
`public/api/uploads.php`, `public/api/jobs.php`, `public/api/download.php` and
`public/webhooks/videxo.php`. `GET /api/jobs.php?id=<id>` also works.
`src/respond.php` handles JSON and passes problem details to the page.

For webhooks, tunnel this port to a public `https` URL and set `VIDEXO_WEBHOOK_URL` to the
address plus `/webhooks/videxo`. Restart the PHP server after changing env vars. Without a webhook
URL the page still polls. The signing secret comes from the dashboard's Webhooks page.

## Production rewrites

The PHP development server is for local use. Configure a production server's document root as
`public/` only. For nginx with your normal PHP-FPM handler, add these rewrites inside `server`:

```nginx
rewrite ^/api/uploads$ /api/uploads.php last;
rewrite ^/api/jobs$ /api/jobs.php last;
rewrite ^/api/jobs/([^/]+)/outputs/([^/]+)$ /api/download.php?id=$1&alias=$2? last;
rewrite ^/api/jobs/([^/]+)$ /api/jobs.php?id=$1? last;
rewrite ^/webhooks/videxo$ /webhooks/videxo.php last;
```

The trailing `?` drops client query arguments so they cannot override the captured job and alias.
Make the nonpublic `storage/` directory writable by PHP; it keeps handled webhook ids behind a
file lock. Keep `src/`, `requests/`, `vendor/` and `.env` outside the document root.

## Before exposing the app

The demo routes share one server API key and have no user sign-in. Add your app's authentication
and check which uploads and jobs each user may use before making them public. The webhook is
instead authenticated by its signature. Keep slow work in your own queue and acknowledge within
seconds. For durable deduplication, put `webhook-id` in a unique database column in the same
transaction as the business update. The demo's local file storage is for a single server.

## Switch the client

Every Videxo call and the webhook check sit in `src/Videxo.php`. That is the only file to change if you
replace plain HTTP with another client. The TypeScript `@videxo/sdk` is not a PHP or Ruby package.

## Webhook body size

The handler checks `Content-Length` first, then reads at most 2,097,153 raw bytes. Bodies over
2 MiB (2,097,152 bytes) receive 413 before verification. Exactly 2 MiB is accepted when signed.
PHP's `post_max_size` and reverse proxy body limits also apply; keep them at least `2M` (PHP's
default is `8M`).

## Malformed-signature regression check

With the server's webhook secret configured, POST `{}` to `/webhooks/videxo` with
`webhook-id: msg_manual`, `webhook-timestamp: <current Unix seconds>` and `webhook-signature: v1`.
Repeat with `webhook-signature: garbage`. Both must answer 400 without runtime errors. A valid
signed body and a pair of valid signatures separated by a space must still answer 204.
The format guard runs before the signing library, which can otherwise throw on a malformed list.

## Webhook size regression check

Send a correctly signed JSON event padded to exactly 2,097,152 raw bytes: expect 204. Add one
byte and expect 413. Repeat both with `Content-Length` and with chunked transfer without that
header. `scripts/check-webhook-limit.ts` in the
[examples repository](https://github.com/videxo-io/examples) runs these four checks.
