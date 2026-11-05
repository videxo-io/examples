# Videxo from an iOS app (Swift)

A SwiftUI app that picks a video, uploads it straight to Videxo with a one-time URL from your
backend, has your backend create the job, follows the job and opens the outputs. The app never
holds an API key; it talks to your backend only.

Docs: https://videxo.io/docs/integrations/swift

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
