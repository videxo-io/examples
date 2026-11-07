import Foundation
import Videxo

/// The background uploads of this app. One for the life of the process, made at launch, so that the
/// result of an upload started before a relaunch finds it.
final class Uploads: @unchecked Sendable {
    static let shared = Uploads()

    private let lock = NSLock()
    private var waiting: [String: CheckedContinuation<CompletedUpload, Error>] = [:]
    private var ended: [String: Result<CompletedUpload, VidexoError>] = [:]
    private var onProgress: (@Sendable (Double) -> Void)?

    // snippet:start uploader
    private(set) lazy var uploader = BackgroundUploader(identifier: "com.example.videxo.uploads") { [unowned self] event in
        switch event {
        case let .progress(upload):
            self.progress(upload.progress.fraction)
        case let .finished(upload, result):
            // The system no longer needs the file. The tag names the copy this app made.
            if let tag = upload.tag, let copy = try? Uploads.copy(named: tag) { try? FileManager.default.removeItem(at: copy) }
            self.finish(upload.id, result)
        }
    }
    // snippet:end uploader

    /// Where a copy lives. By name, since the path of an app's container can change between launches.
    static func copy(named name: String) throws -> URL {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return support.appendingPathComponent(name)
    }

    func observe(_ handler: @escaping @Sendable (Double) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        onProgress = handler
    }

    private func progress(_ fraction: Double) {
        lock.lock()
        let handler = onProgress
        lock.unlock()
        handler?(fraction)
    }

    private func finish(_ id: String, _ result: Result<CompletedUpload, VidexoError>) {
        lock.lock()
        defer { lock.unlock() }
        if let waiter = waiting.removeValue(forKey: id) {
            waiter.resume(with: result.mapError { $0 as Error })
        } else {
            ended[id] = result
        }
    }

    /// The end of an upload this process is waiting for. In your app, keep the result somewhere that
    /// outlives the process: the app may be ended before the upload is.
    func completion(of id: String) async throws -> CompletedUpload {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            defer { lock.unlock() }
            if let result = ended.removeValue(forKey: id) {
                continuation.resume(with: result.mapError { $0 as Error })
            } else {
                waiting[id] = continuation
            }
        }
    }
}

struct TokenFlow: Sendable {
    let backend: TokenBackend
    /// `VidexoClient.defaultBaseURL` unless you run the API yourself in development.
    var apiURL = VidexoClient.defaultBaseURL

    // snippet:start flow
    /// Uploads `file` and follows the job your backend creates from it. `file` is from a picker, so it
    /// is copied first: the system reads it while the app is suspended.
    func run(file: URL, onStatus: @Sendable @escaping (String) -> Void) async throws -> ClientJob {
        let minted = try await backend.uploadToken()
        // `getToken` refreshes a token when it is about to end, so a long flow keeps its uploads and jobs.
        let getToken: VidexoClient.GetToken = { [backend] request in try await backend.refresh(tokenId: request.tokenId) }
        let videxo = try VidexoClient(token: minted.token, tokenId: minted.id, baseURL: apiURL, getToken: getToken)

        onStatus("Uploading")
        let copy = try copyIntoContainer(file)
        let upload = try await videxo.uploads.create(forFile: copy)
        let started = try Uploads.shared.uploader.start(file: copy, to: upload.uploadURL, tag: copy.lastPathComponent)
        let completed = try await Uploads.shared.completion(of: started.id)

        // Only your backend creates the job, and answers a continuation that may read it. The token cannot.
        onStatus("Creating the job")
        let job = try await backend.createJob(continues: minted.id, inputURL: completed.inputURL)
        let follower = try VidexoClient(token: job.token, tokenId: job.id, baseURL: apiURL, getToken: getToken)
        onStatus("Job \(job.jobId): running")
        return try await follower.jobs.wait(job.jobId)
    }
    // snippet:end flow

    private func copyIntoContainer(_ file: URL) throws -> URL {
        // A file from the picker is outside the app's sandbox until it asks for access.
        let access = file.startAccessingSecurityScopedResource()
        defer { if access { file.stopAccessingSecurityScopedResource() } }
        let copy = try Uploads.copy(named: "\(UUID().uuidString)-\(file.lastPathComponent)")
        try FileManager.default.copyItem(at: file, to: copy)
        return copy
    }
}
