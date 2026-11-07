# Videxo from an iOS app (Swift)

Two small SwiftUI apps. Neither ever holds an API key.

- `VidexoExample/`, the backend flow: the app picks a video, uploads it straight to Videxo with a
  one-time URL from your backend, has your backend create the job, follows the job and opens the
  outputs. It talks to your backend only and needs no package.
- `VidexoTokenExample/`, the client token flow: your backend mints a client token, and the app uses
  the Videxo Swift package to upload in a background session and follow the job itself. See
  [below](#the-client-token-flow).

Docs: https://videxo.io/docs/integrations/swift and https://videxo.io/docs/sdk/swift

## The backend

Any server example of the Videxo docs (Express, Next.js, SvelteKit, FastAPI, Go, PHP, Laravel,
Rails): they all answer the routes this app calls, `POST /api/uploads`, `POST /api/jobs`,
`GET /api/jobs/{id}` and `GET /api/jobs/{id}/outputs/{alias}`, keep the API key, and receive and
verify the webhook.

## Run it

1. Start a backend on port 3000.
2. In Xcode, create an iOS App project (SwiftUI, iOS 16 or newer) and add the three files in
   `VidexoExample/`, replacing the generated app and content view.
3. Set `baseURL` in `VidexoExampleApp.swift` to your backend; `http://localhost:3000` reaches it
   from the simulator. Plain `http` may need an App Transport Security exception for local
   networking; use your backend's `https` address on a device.
4. Run the app, pick a video and choose the job.

## Files

| File | What it does |
|---|---|
| `VidexoExample/BackendClient.swift` | The calls to your backend with `URLSession`: upload URL, PUT, create, wait, download link. |
| `VidexoExample/ContentView.swift` | The screen: pick, upload, create, follow the job, open the outputs. |
| `VidexoExample/VidexoExampleApp.swift` | The app, with your backend's address. |

## The client token flow

The app in `VidexoTokenExample/` needs the [Videxo Swift package](https://github.com/videxo-io/videxo-swift):
in Xcode, choose **File**, then **Add Package Dependencies**, and enter that address. Its backend is
the Express example, which also answers two routes for a signed-in user: `POST /api/client-tokens`
(no body fields: a new upload token; `continues`: the next token of that user's chain) and
`POST /api/client-tokens/jobs` (`continues` and `input_url`).

These routes refuse everyone with `401` until you replace `currentUser` in its `src/app.ts` with your
own sign-in, and send your user's session as `session` in `VidexoTokenExampleApp.swift`. To try them
locally, start the server with `VIDEXO_EXAMPLE_TEST_SESSIONS='{"session-from-your-sign-in":"user_1"}'`.
Never set that in production.

1. The app asks your backend for a client token.
2. It copies the picked file inside its sandbox, creates the upload with the token, and starts
   a background upload, which goes on when the app is suspended.
3. It sends the upload's `input_url` to your backend, which creates the job with its API key and
   answers a continuation of the token that may read the job.
4. It follows the job with that token. When a token is about to end, `getToken` asks your backend
   for the next one.

| File | What it does |
|---|---|
| `VidexoTokenExample/TokenBackend.swift` | The calls to your backend: mint a token, refresh it, create the job. |
| `VidexoTokenExample/TokenFlow.swift` | The flow: copy, create, upload in the background, create the job, follow it. |
| `VidexoTokenExample/VidexoTokenExampleApp.swift` | The app, the screen, and the background session's launch events. |
