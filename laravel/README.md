# Videxo with Laravel 12

These are additions to a fresh Laravel 12 app, not a whole application skeleton. PHP 8.2 or newer
and Composer are required. The browser uploads straight to Videxo, creates one MP4 or several
outputs from `requests/`, polls the job and follows fresh download links. The API key stays in
the server environment. Problem details keep the API's status, fields and media type.

Docs: https://videxo.io/docs/integrations/laravel

## Install and run

From this downloaded example directory, first remember its location. Create the app alongside it:

```bash
EXAMPLE_DIR="$PWD"
composer create-project laravel/laravel ../videxo-laravel '^12.0'
cd ../videxo-laravel
composer require standard-webhooks/standard-webhooks:^1.0.2
cp -R "$EXAMPLE_DIR/app/." app/
cp -R "$EXAMPLE_DIR/requests" .
cp "$EXAMPLE_DIR/public/index.html" public/index.html
```

Then merge these additions, preserving the fresh app's other settings:

1. Add the imports and routes from `routes/web.php`. Replace the existing `/` welcome route.
2. Add the `videxo` entry from `config/services.php` to the existing returned array.
3. Inside the existing `withMiddleware` callback in `bootstrap/app.php`, add the call from this
   example's `bootstrap/app.php`. Do not replace that whole file. The webhook and only the two
   demo POST routes skip CSRF because the shared static page has no session token. The two JSON
   transformations skip the webhook so they cannot read its body before the controller's limit.
4. Append the names in this example's `.env.example` to the app's existing `.env`. Fill in the
   API key and webhook signing secret. `VIDEXO_API_URL` defaults to `https://api.videxo.io`;
   set it to your local API's origin for local testing.
5. Set `PORT` to a free local port, then run `php artisan serve --host=127.0.0.1 --port="$PORT"`.
   Open `http://127.0.0.1:$PORT`. No frontend build is needed.

Webhooks need a public `https` URL. Tunnel the app's port and set `VIDEXO_WEBHOOK_URL` to its
address plus `/webhooks/videxo`. Without it the page still polls every 2 seconds.

## Browser request or background job

`VidexoController::create` calls the service directly and returns the created Job with 202, so the
page can poll it. For your own background work, for example after an order is paid, use
`CreateVidexoJob::dispatch('transcode', $inputUrl)` or the `jobs` kind and run
`php artisan queue:work`. The queued job logs the new job id; replace that line with saving the
id on your order. Both paths derive the same `transcode-<upload id>` or `jobs-<upload id>` key, so
retries within Videxo's 24-hour idempotency window return the same Job. A background dispatch
returns a queued task, not the Videxo Job; do not use it as the page's response.

## Files

- `app/Services/Videxo.php`: Laravel's `Http` client and the Standard Webhooks check.
- `app/Exceptions/VidexoProblem.php`: the API's problem carried to the controller.
- `app/Http/Controllers/VidexoController.php`: uploads, job create/read, download and webhook.
- `app/Jobs/CreateVidexoJob.php`: the background alternative, with retry-safe creation.
- `routes/web.php`, `bootstrap/app.php`, `config/services.php`: additions to merge.
- `public/index.html`, `requests/*.json`: the shared page and the bodies read at runtime.

Webhook deduplication uses Laravel's file cache explicitly, including a lock, so a fresh app needs
no cache table. Clearing that cache also clears the remembered delivery ids.

## Before exposing the app

The demo routes share one server API key and have no user sign-in. Add your app's authentication
and check which uploads and jobs each user may use before making them public. The webhook is
instead authenticated by its signature. Keep slow work in your own queue and acknowledge within
seconds. For durable deduplication, put `webhook-id` in a unique database column in the same
transaction as the business update. The demo's local file storage is for a single server.

## Switch the client

Every Videxo call and the webhook check sit in `app/Services/Videxo.php`. That is the only file to change if you
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
