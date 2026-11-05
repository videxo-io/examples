import Foundation

// The app talks to your backend, never to Videxo: the API key stays on your server. The backend is
// any server example of the Videxo docs (Express, Next.js, FastAPI, Go, Laravel, ...), which all
// answer the same routes: POST /api/uploads, POST /api/jobs, GET /api/jobs/{id} and
// GET /api/jobs/{id}/outputs/{alias}.

struct Output: Decodable, Identifiable {
    let alias: String
    let filename: String
    var id: String { alias }
}

struct Job: Decodable {
    struct Failure: Decodable {
        let code: String
        let message: String
    }

    let id: String
    let state: String
    let outputs: [Output]
    let error: Failure?

    var isActive: Bool { state == "queued" || state == "running" }
}

/// An error answer of the backend: problem details (RFC 9457), as Videxo answers them.
struct Problem: Decodable, Error, LocalizedError {
    let title: String?
    let detail: String?
    let code: String?

    var errorDescription: String? { [title, detail].compactMap { $0 }.joined(separator: " ") }
}

struct BackendClient {
    /// Your server, for example https://app.example.com. In the simulator, http://localhost:3000 reaches a local one.
    let baseURL: URL
    var session: URLSession = .shared

    // snippet:start upload
    /// Asks the backend for a one-time upload URL, then sends the file straight to Videxo with it.
    /// The upload URL holds no API key and takes one PUT, so the app never retries the PUT: when
    /// it fails this throws, and the next call creates a new upload.
    func upload(file: URL, contentType: String) async throws -> String {
        let size = try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int ?? 0
        struct Created: Decodable {
            let input_url: String
            let upload_url: URL
        }
        let created: Created = try await send(
            "POST", "api/uploads",
            body: ["filename": plainName(file.lastPathComponent), "size_bytes": size, "content_type": contentType])
        var put = URLRequest(url: created.upload_url)
        put.httpMethod = "PUT"
        put.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.upload(for: put, fromFile: file)
        try check(data, response)
        return created.input_url
    }
    // snippet:end upload

    // snippet:start create
    /// Asks the backend to create the job from the upload: "transcode" (one MP4) or "jobs" (several outputs).
    func createJob(inputURL: String, kind: String) async throws -> Job {
        try await send("POST", "api/jobs", body: ["kind": kind, "input_url": inputURL])
    }

    /// Reads the job every 2 seconds until it ends. A push from your backend (after its webhook) can replace the polling.
    func waitForJob(_ job: Job) async throws -> Job {
        var current = job
        while current.isActive {
            try await Task.sleep(nanoseconds: 2_000_000_000)
            current = try await send("GET", "api/jobs/\(current.id)")
        }
        return current
    }
    // snippet:end create

    // snippet:start download
    /// The backend's download route: it redirects to a fresh signed link. Opened with a `Link`, the
    /// browser follows it; with `session.download(from:)` the app saves the file itself.
    func downloadURL(job: Job, output: Output) -> URL {
        baseURL.appendingPathComponent("api/jobs/\(job.id)/outputs/\(output.alias)")
    }
    // snippet:end download

    // snippet:start request
    private func send<T: Decodable>(_ method: String, _ path: String, body: [String: Any]? = nil) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        try check(data, response)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// An answer outside 2xx becomes its problem details, so the app can show the detail.
    private func check(_ data: Data, _ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) else { return }
        throw (try? JSONDecoder().decode(Problem.self, from: data))
            ?? Problem(title: "The server answered with an error.", detail: "HTTP \(http.statusCode)", code: nil)
    }
    // snippet:end request

    /// A plain filename as the API wants it: letters, digits, dots, underscores and hyphens.
    private func plainName(_ name: String) -> String {
        let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-")
        let cleaned = String(name.map { allowed.contains($0) ? $0 : "-" }.drop { !$0.isLetter && !$0.isNumber }.suffix(100))
        return cleaned.isEmpty ? "upload.bin" : cleaned
    }
}
