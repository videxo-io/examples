# Videxo with Ruby on Rails 8

These are additions to a fresh Rails 8 app, not an application skeleton. Use Ruby 3.3 or newer
and Rails 8. The browser uploads straight to Videxo, creates one MP4 or several outputs from
`requests/`, polls the job and follows fresh download links. The API key stays in the server
environment. API problem details keep their status, fields and media type.

Docs: https://videxo.io/docs/integrations/rails

## Install and run

From this downloaded example directory, create a normal Rails app alongside it:

```bash
EXAMPLE_DIR="$PWD"
rails new ../videxo-rails
cd ../videxo-rails
bundle add standardwebhooks --version '~> 1.0'
cp -R "$EXAMPLE_DIR/app/." app/
cp -R "$EXAMPLE_DIR/requests" .
cp "$EXAMPLE_DIR/config/initializers/videxo_webhook_body_limit.rb" config/initializers/
cp "$EXAMPLE_DIR/public/index.html" public/index.html
cp "$EXAMPLE_DIR/.env.example" .env
```

Run these commands with Rails 8 installed. The
`bundle add` step adds `gem 'standardwebhooks', '~> 1.0'` to `Gemfile` and runs Bundler. Merge the
routes from `config/routes.rb` into your existing `Rails.application.routes.draw` block. Replace
an existing root route. No frontend build is needed for the static page.

Fill in `.env` with shell assignments for the API key and webhook signing secret. Rails does not
load `.env` by itself; export it in the shell that starts the app:

```bash
set -a
. ./.env
set +a
bin/rails db:prepare
# Set PORT to a free local port.
bin/rails server --binding=127.0.0.1 --port="$PORT"
```

Open `http://127.0.0.1:$PORT`. Set `VIDEXO_API_URL` to the local API's origin for local testing;
otherwise it defaults to `https://api.videxo.io`. For webhooks tunnel this port to a public
`https` URL and set `VIDEXO_WEBHOOK_URL` to its address plus `/webhooks/videxo`. Restart the
server after changing env vars. Without a webhook URL the page still polls every 2 seconds.
For a development tunnel, add its exact hostname to `config.hosts` in
`config/environments/development.rb`, for example `config.hosts << "your-tunnel.example.com"`,
and restart Rails. Host authorization otherwise refuses the public host before the webhook runs.
Keep the other allowed hosts; do not clear the list.

## Browser request or background job

The controller calls `CreateVidexoJob.perform_now('transcode', input_url)` and answers the created
Job with 202, so the page can poll it. To create it in your own background workflow, use
`CreateVidexoJob.perform_later('transcode', input_url)` (or `jobs`) and run your queue backend
(`bin/jobs start` for Rails 8's Solid Queue). The job returns and logs the job id; save it on your
order for later webhook updates. `perform_later` returns an Active Job, not the Videxo Job.
Both paths derive the same key from the upload and kind, so retries within Videxo's 24-hour
idempotency window return the same Job.

## Files

- `app/services/videxo.rb`: every HTTP call (`Net::HTTP`) and the webhook check.
- `app/controllers/videxo_controller.rb`: upload, create/read, download and problem responses.
- `app/controllers/webhooks_controller.rb`: reads a bounded raw body, verifies it, deduplicates and answers 204.
- `app/jobs/create_videxo_job.rb`: Active Job for creation, synchronous for the browser.
- `config/routes.rb`: additions to merge into the fresh app's routes.
- `config/initializers/videxo_webhook_body_limit.rb`: a first Rack middleware that bounds the raw
  body before Rails logs or parses request parameters.
- `public/index.html`, `requests/*.json`: the shared page and the bodies read at runtime.

The webhook skips CSRF. The two browser POST actions also skip it for the identical static demo
page, which has no session token. The download redirect allows another host explicitly because
the fresh signed URL points to Videxo. A locked file in `tmp/videxo-webhooks.json` remembers
webhook ids across requests, even when Rails' development cache is disabled.

## Before exposing the app

The demo routes share one server API key and have no user sign-in. Add your app's authentication
and check which uploads and jobs each user may use before making them public. The webhook is
instead authenticated by its signature. Keep slow work in your own queue and acknowledge within
seconds. For durable deduplication, put `webhook-id` in a unique database column in the same
transaction as the business update. The demo's local file storage is for a single server.

## Switch the client

Every Videxo call and the webhook check sit in `app/services/videxo.rb`. That is the only file to change if you
replace plain HTTP with another client. The TypeScript `@videxo/sdk` is not a PHP or Ruby package.

## Webhook body size

The initializer installs a first Rack middleware that checks `Content-Length`, then reads at most
2,097,153 raw bytes. It runs before Rails logs or parses request parameters and gives the controller
only bounded bytes. The controller also bounds its read from `request.body`; it calls
`request.content_length` only when that header exists because Rails otherwise reads chunked bodies
to compute their size. Bodies over 2 MiB (2,097,152 bytes) receive 413 before verification. Exactly
2 MiB is accepted when signed. Keep any reverse proxy body limit at least 2 MiB.

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
