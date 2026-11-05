package io.videxo.example

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.BufferedSink
import okio.source
import org.json.JSONObject
import java.io.File

// The app talks to your backend, never to Videxo: the API key stays on your server. The backend is
// any server example of the Videxo docs (Express, Next.js, FastAPI, Go, Laravel, ...), which all
// answer the same routes: POST /api/uploads, POST /api/jobs, GET /api/jobs/{id} and
// GET /api/jobs/{id}/outputs/{alias}.

data class Output(val alias: String, val filename: String)

data class Job(val id: String, val state: String, val outputs: List<Output>, val error: String?) {
    val isActive get() = state == "queued" || state == "running"
}

/** An error answer of the backend: problem details (RFC 9457), as Videxo answers them. */
class Problem(val title: String?, val detail: String?, val code: String?) :
    Exception(listOfNotNull(title, detail).joinToString(" "))

/** [baseUrl] is your server, for example https://app.example.com; the emulator reaches a local one at http://10.0.2.2:3000. */
class BackendClient(private val baseUrl: String, private val http: OkHttpClient = OkHttpClient()) {
    /** The largest direct upload Videxo takes (100 MB). */
    private val MAX_UPLOAD_BYTES = 100_000_000L

    /** The client for the PUT: no retry after a failed connection, so a used upload URL is never sent twice. */
    private val uploads = http.newBuilder().retryOnConnectionFailure(false).build()

    // snippet:start upload
    /**
     * Asks the backend for a one-time upload URL, then sends the file straight to Videxo with it.
     * The upload URL holds no API key and takes one PUT, so the PUT is never retried: when it
     * fails this throws, and the next call creates a new upload. [cacheDir] holds a copy of a file
     * whose provider does not tell its size (some cloud providers), to send its exact length.
     */
    suspend fun upload(resolver: ContentResolver, file: Uri, cacheDir: File): String = withContext(Dispatchers.IO) {
        val contentType = resolver.getType(file) ?: "application/octet-stream"
        val (name, reported) = resolver.query(file, null, null, null, null)!!.use { cursor ->
            cursor.moveToFirst()
            val size = cursor.getColumnIndexOrThrow(OpenableColumns.SIZE)
            cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)) to
                (if (cursor.isNull(size)) null else cursor.getLong(size))
        }
        // An unknown or empty size: copy the file once, up to the direct upload limit, and send the
        // copy, whose length is exact. The finally below deletes the copy, also after a failed one.
        var copy: File? = null
        try {
            if (reported == null || reported <= 0) {
                val target = File.createTempFile("upload", null, cacheDir)
                copy = target
                copyAtMost(resolver, file, target, MAX_UPLOAD_BYTES)
            }
            val size = copy?.length() ?: reported!!
            val created = send(
                "POST", "api/uploads",
                JSONObject().put("filename", plainName(name)).put("size_bytes", size).put("content_type", contentType),
            )
            val bytes = object : RequestBody() {
                override fun contentType() = contentType.toMediaType()
                override fun contentLength() = size
                // OkHttp must not send the body twice: the upload URL takes one PUT.
                override fun isOneShot() = true
                override fun writeTo(sink: BufferedSink) {
                    (copy?.inputStream() ?: resolver.openInputStream(file)!!).source().use { sink.writeAll(it) }
                }
            }
            val put = Request.Builder().url(created.getString("upload_url")).put(bytes).build()
            uploads.newCall(put).execute().use { check(it) }
            created.getString("input_url")
        } finally {
            copy?.delete()
        }
    }

    /** Copies [file] into [target]; throws once it passes [limit] bytes, so a huge file never fills the cache. */
    private fun copyAtMost(resolver: ContentResolver, file: Uri, target: File, limit: Long) {
        resolver.openInputStream(file)!!.use { input ->
            target.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                var total = 0L
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    total += read
                    if (total > limit) throw Problem("The file is too large.", "A direct upload is at most 100 MB.", "limit_exceeded")
                    output.write(buffer, 0, read)
                }
            }
        }
    }
    // snippet:end upload

    // snippet:start create
    /** Asks the backend to create the job from the upload: "transcode" (one MP4) or "jobs" (several outputs). */
    suspend fun createJob(inputUrl: String, kind: String): Job = withContext(Dispatchers.IO) {
        job(send("POST", "api/jobs", JSONObject().put("kind", kind).put("input_url", inputUrl)))
    }

    /** Reads the job every 2 seconds until it ends. A push from your backend (after its webhook) can replace the polling. */
    suspend fun waitForJob(start: Job): Job {
        var current = start
        while (current.isActive) {
            delay(2_000)
            current = withContext(Dispatchers.IO) { job(send("GET", "api/jobs/${current.id}")) }
        }
        return current
    }
    // snippet:end create

    // snippet:start download
    /** The backend's download route: it redirects to a fresh signed link, which the browser or DownloadManager follows. */
    fun downloadUrl(job: Job, output: Output): Uri = Uri.parse("$baseUrl/api/jobs/${job.id}/outputs/${output.alias}")
    // snippet:end download

    // snippet:start request
    private fun send(method: String, path: String, body: JSONObject? = null): JSONObject {
        val requestBody = body?.toString()?.toRequestBody("application/json".toMediaType())
        val request = Request.Builder().url("$baseUrl/$path").method(method, requestBody).build()
        http.newCall(request).execute().use { response ->
            check(response)
            return JSONObject(response.body.string())
        }
    }

    /** An answer outside 2xx becomes its problem details, so the app can show the detail. */
    private fun check(response: Response) {
        if (response.isSuccessful) return
        val problem = runCatching { JSONObject(response.body.string()) }.getOrNull()
        throw Problem(
            problem?.optString("title") ?: "The server answered with an error.",
            problem?.optString("detail") ?: "HTTP ${response.code}",
            problem?.optString("code"),
        )
    }
    // snippet:end request

    private fun job(json: JSONObject): Job {
        val outputs = json.getJSONArray("outputs")
        return Job(
            id = json.getString("id"),
            state = json.getString("state"),
            outputs = List(outputs.length()) { i -> outputs.getJSONObject(i).let { Output(it.getString("alias"), it.getString("filename")) } },
            error = json.optJSONObject("error")?.let { "${it.getString("code")}: ${it.getString("message")}" },
        )
    }

    /** A plain filename as the API wants it: letters, digits, dots, underscores and hyphens. */
    private fun plainName(name: String): String =
        name.replace(Regex("[^A-Za-z0-9_.-]+"), "-").replace(Regex("^[^A-Za-z0-9]+"), "").takeLast(100).ifEmpty { "upload.bin" }
}
