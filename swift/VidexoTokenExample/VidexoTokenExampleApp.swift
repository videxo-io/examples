import SwiftUI
import UniformTypeIdentifiers
import Videxo
#if os(iOS)
import UIKit

/// Hands the system's completion handler to the uploader, when the system wakes the app for an upload.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // At launch, so that the results of earlier uploads find it.
        _ = Uploads.shared.uploader
        return true
    }

    // snippet:start events
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        Uploads.shared.uploader.handleEvents(completionHandler: completionHandler)
    }
    // snippet:end events
}
#endif

@main
struct VidexoTokenExampleApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #endif

    var body: some Scene {
        WindowGroup {
            // Your backend's address and the user's session with it, from your own sign-in. Never an API key in the app.
            TokenFlowView(flow: TokenFlow(backend: TokenBackend(baseURL: URL(string: "http://localhost:3000")!, session: "session-from-your-sign-in")))
        }
    }
}

struct TokenFlowView: View {
    let flow: TokenFlow
    @State private var picking = false
    @State private var running = false
    @State private var status = ""
    @State private var fraction = 0.0
    @State private var job: ClientJob?
    @State private var problem: String?

    var body: some View {
        Form {
            Button("Pick a video and process it") { picking = true }
                .disabled(running)
            if !status.isEmpty { Text(status) }
            if running, fraction > 0, fraction < 1 { ProgressView(value: fraction) }
            if let failure = job?.error { Text("\(failure.code): \(failure.message)") }
            if let job {
                ForEach(job.outputs, id: \.alias) { output in
                    if let link = output.downloadURL { Link(output.filename, destination: link) }
                }
            }
            if let problem { Text(problem).foregroundStyle(.red) }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.movie]) { result in
            guard case .success(let file) = result else { return }
            Task { await process(file) }
        }
    }

    @MainActor
    private func process(_ file: URL) async {
        running = true
        defer { running = false }
        problem = nil
        job = nil
        fraction = 0
        Uploads.shared.observe { value in Task { @MainActor in fraction = value } }
        do {
            let ended = try await flow.run(file: file) { text in Task { @MainActor in status = text } }
            status = "Job \(ended.id): \(ended.state.rawValue)"
            job = ended
        } catch {
            status = ""
            problem = error.localizedDescription
        }
    }
}
