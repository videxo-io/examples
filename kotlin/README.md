# Videxo from an Android app (Kotlin)

A Jetpack Compose app that picks a video, uploads it straight to Videxo with a one-time URL from
your backend, has your backend create the job, follows the job and opens the outputs. The app never
holds an API key; it talks to your backend only, and needs no Videxo package.

`app/src/main/java/io/videxo/example/token/` holds the same flow with a client token and the Videxo
Android SDK, which is not published yet: see [below](#the-client-token-flow).

Docs: https://videxo.io/docs/integrations/kotlin

## The backend

Any server example of the Videxo docs (Express, Next.js, SvelteKit, FastAPI, Go, PHP, Laravel,
Rails): they all answer the routes this app calls, `POST /api/uploads`, `POST /api/jobs`,
`GET /api/jobs/{id}` and `GET /api/jobs/{id}/outputs/{alias}`, keep the API key, and receive and
verify the webhook.

## Run it

1. Start a backend on port 3000.
2. In Android Studio, create an app with an Empty Activity (Jetpack Compose) and the package
   `io.videxo.example`, and add the two files in `app/src/main/java/io/videxo/example/`.
3. Add to the app module's `build.gradle.kts`:

   ```kotlin
   dependencies {
       implementation("com.squareup.okhttp3:okhttp:5.5.1")
       implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
   }
   ```

4. Add `<uses-permission android:name="android.permission.INTERNET" />` to the manifest, and for
   plain `http` in development `android:usesCleartextTraffic="true"` on the application.
5. `http://10.0.2.2:3000` (set at the top of `MainActivity.kt`) reaches the backend from the
   emulator; use your backend's `https` address on a device.
6. Run the app, pick a video and choose the job.

## Files

| File | What it does |
|---|---|
| `BackendClient.kt` | The calls to your backend with OkHttp: upload URL, streamed PUT, create, wait, download link. |
| `MainActivity.kt` | The screen: pick, upload, create, follow the job, open the outputs. |

## The client token flow

The files in `token/` use the Videxo Android SDK (`io.videxo:videxo-android`), which is not on Maven
Central yet; they show the flow it will take. Its backend is the Express example, which also answers
two routes for a signed-in user: `POST /api/client-tokens` (no body fields: a new upload token;
`continues`: the next token of that user's chain) and `POST /api/client-tokens/jobs` (`continues` and
`input_url`). These routes refuse everyone with `401` until you replace `currentUser` in its
`src/app.ts` with your own sign-in, and pass your user's session to `TokenBackend`.

1. The app asks your backend for a client token.
2. The uploader copies the picked file into the app's storage, the one read of it, which gives the
   exact size; the app creates the upload with the token and starts it through WorkManager, which
   goes on when the app is in the background.
3. It sends the upload's `input_url` to your backend, which creates the job with its API key and
   answers a continuation of the token that may read the job.
4. It follows the job with that token. When a token is about to end, `getToken` asks your backend
   for the next one.

| File | What it does |
|---|---|
| `token/TokenBackend.kt` | The calls to your backend: mint a token, refresh it, create the job. |
| `token/TokenFlow.kt` | The flow: copy, create, upload through WorkManager, create the job, follow it. |
