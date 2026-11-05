package io.videxo.example

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// Your backend's address; never Videxo's, and never an API key in the app. 10.0.2.2 is the host
// machine as the Android emulator sees it.
private val backend = BackendClient("http://10.0.2.2:3000")

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { VidexoScreen() } }
    }
}

@Composable
fun VidexoScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var kind by remember { mutableStateOf("transcode") }
    var status by remember { mutableStateOf("") }
    var job by remember { mutableStateOf<Job?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    // One job at a time: a second pick would race the first for the status and the outputs.
    var busy by remember { mutableStateOf(false) }

    // snippet:start flow
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { file: Uri? ->
        if (file == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            try {
                problem = null
                job = null
                status = "Uploading"
                val inputUrl = backend.upload(context.contentResolver, file, context.cacheDir)
                val created = backend.createJob(inputUrl, kind)
                status = "Job ${created.id}: ${created.state}"
                val ended = backend.waitForJob(created)
                status = "Job ${ended.id}: ${ended.state}"
                job = ended
            } catch (error: Exception) {
                status = ""
                problem = error.message
            } finally {
                busy = false
            }
        }
    }
    // snippet:end flow

    Column(Modifier.padding(16.dp)) {
        Row { RadioButton(kind == "transcode", { kind = "transcode" }); Text("One MP4") }
        Row { RadioButton(kind == "jobs", { kind = "jobs" }); Text("MP4, poster and GIF preview") }
        Button(onClick = { pick.launch("video/*") }, enabled = !busy) { Text("Pick a video and process it") }
        if (status.isNotEmpty()) Text(status)
        job?.error?.let { Text(it) }
        job?.let { ended ->
            ended.outputs.forEach { output ->
                TextButton({ context.startActivity(Intent(Intent.ACTION_VIEW, backend.downloadUrl(ended, output))) }) {
                    Text(output.filename)
                }
            }
        }
        problem?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}
