import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    let backend: BackendClient
    @State private var picking = false
    @State private var kind = "transcode"
    @State private var status = ""
    @State private var job: Job?
    @State private var problem: String?
    @State private var running = false

    var body: some View {
        Form {
            Picker("Job", selection: $kind) {
                Text("One MP4").tag("transcode")
                Text("MP4, poster and GIF preview").tag("jobs")
            }
            // One job at a time: a second pick would race the first for the status and the outputs.
            Button("Pick a video and process it") { picking = true }
                .disabled(running)
            if !status.isEmpty { Text(status) }
            if let failure = job?.error { Text("\(failure.code): \(failure.message)") }
            if let job {
                ForEach(job.outputs) { output in
                    Link(output.filename, destination: backend.downloadURL(job: job, output: output))
                }
            }
            if let problem { Text(problem).foregroundStyle(.red) }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.movie, .audio, .image]) { result in
            guard case .success(let file) = result else { return }
            Task { await process(file) }
        }
    }

    // snippet:start flow
    private func process(_ file: URL) async {
        running = true
        defer { running = false }
        problem = nil
        job = nil
        // A file from the picker is outside the app's sandbox until it asks for access.
        let access = file.startAccessingSecurityScopedResource()
        defer { if access { file.stopAccessingSecurityScopedResource() } }
        let contentType = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        do {
            status = "Uploading"
            let inputURL = try await backend.upload(file: file, contentType: contentType)
            let created = try await backend.createJob(inputURL: inputURL, kind: kind)
            status = "Job \(created.id): \(created.state)"
            let ended = try await backend.waitForJob(created)
            status = "Job \(ended.id): \(ended.state)"
            job = ended
        } catch {
            status = ""
            problem = error.localizedDescription
        }
    }
    // snippet:end flow
}
