package io.videxo.example.token

import android.content.Context
import android.net.Uri
import io.videxo.BackgroundUpload
import io.videxo.BackgroundUploader
import io.videxo.ClientJob
import io.videxo.GetToken
import io.videxo.UploadSource
import io.videxo.VidexoClient
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.onEach

/**
 * The client token flow: your backend mints a token, the app uploads with it in the background and
 * follows the job your backend creates. [apiUrl] is Videxo's API unless you run it yourself in development.
 */
class TokenFlow(
    private val context: Context,
    private val backend: TokenBackend,
    private val apiUrl: String = VidexoClient.DEFAULT_BASE_URL,
) {
    // One uploader for the app. WorkManager keeps an upload going in the background and runs it again
    // after a process death; `uploads()` lists those under way, also after a relaunch.
    private val uploader = BackgroundUploader(context)

    /** Uploads the picked [file] and follows the job your backend creates from it. */
    suspend fun run(
        file: Uri,
        onStatus: (String) -> Unit,
    ): ClientJob {
        val minted = backend.uploadToken()
        // `getToken` refreshes a token when it is about to end, so a long flow keeps its uploads and jobs.
        val getToken: GetToken = { request -> backend.refresh(request.tokenId) }
        val videxo = VidexoClient(minted.token, minted.id, apiUrl, getToken = getToken)

        onStatus("Uploading")
        // The picker's permission to read the file ends with the process, so the uploader copies it first.
        // The copy is its one read of the file, and gives the exact size the upload is created with.
        val prepared = uploader.prepare(UploadSource.content(context, file))
        val upload = videxo.uploads.create(prepared)
        val started = uploader.start(prepared, upload, tag = upload.inputUrl)
        val ended =
            uploader
                .upload(started.id)
                .filterNotNull()
                .onEach { (it.status as? BackgroundUpload.Status.Sending)?.let { sending -> onStatus("Uploading ${(sending.progress.fraction * 100).toInt()}%") } }
                .first { it.isFinished }
        val completed =
            when (val status = ended.status) {
                is BackgroundUpload.Status.Succeeded -> status.upload
                is BackgroundUpload.Status.Failed -> throw status.error
                else -> error("The upload was cancelled.")
            }

        // Only your backend creates the job, and answers a continuation that may read it. The token cannot.
        onStatus("Creating the job")
        val job = backend.createJob(minted.id, completed.inputUrl)
        val follower = VidexoClient(job.token, job.id, apiUrl, getToken = getToken)
        onStatus("Job ${job.jobId}: running")
        return follower.jobs.wait(job.jobId)
    }
}
