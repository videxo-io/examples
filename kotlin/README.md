# Videxo from an Android app (Kotlin)

A Jetpack Compose app that picks a video, uploads it straight to Videxo with a one-time URL from
your backend, has your backend create the job, follows the job and opens the outputs. The app never
holds an API key; it talks to your backend only.

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
