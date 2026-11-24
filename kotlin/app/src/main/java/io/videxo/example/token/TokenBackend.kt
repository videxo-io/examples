package io.videxo.example.token

import io.videxo.FreshToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

// The calls to your backend. It keeps the API key: it mints the client tokens and creates the jobs, for
// the user your own sign-in says is asking. The Express example answers these two routes.

class MintedToken(val id: String, val token: String)

class FollowedJob(val jobId: String, val id: String, val token: String)

/**
 * [baseUrl] is your server, for example https://app.example.com; the emulator reaches a local one at
 * http://10.0.2.2:3000. [session] is the signed-in user's session with your server, from your own
 * sign-in. Never an API key.
 */
class TokenBackend(
    private val baseUrl: String,
    private val session: String,
    private val http: OkHttpClient = OkHttpClient(),
) {
    /** A new client token for one upload. */
    suspend fun uploadToken(): MintedToken = post("api/client-tokens", JSONObject()).let { MintedToken(it.getString("id"), it.getString("token")) }

    /** The next token of the chain. `VidexoClient` asks for it when the current one is about to end. */
    suspend fun refresh(tokenId: String?): FreshToken {
        val next = post("api/client-tokens", JSONObject().put("continues", tokenId ?: throw IOException("No token to continue.")))
        return FreshToken(next.getString("token"), next.getString("id"))
    }

    /** Your backend creates the job from the upload, with its API key, and answers a continuation that may read it. */
    suspend fun createJob(
        continues: String,
        inputUrl: String,
    ): FollowedJob {
        val job = post("api/client-tokens/jobs", JSONObject().put("continues", continues).put("input_url", inputUrl))
        return FollowedJob(job.getString("job_id"), job.getString("id"), job.getString("token"))
    }

    private suspend fun post(
        path: String,
        body: JSONObject,
    ): JSONObject =
        withContext(Dispatchers.IO) {
            val request =
                Request
                    .Builder()
                    .url("$baseUrl/$path")
                    .header("Authorization", "Bearer $session")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IOException("Your backend answered ${response.code}.")
                JSONObject(response.body.string())
            }
        }
}
