import SwiftUI

@main
struct VidexoExampleApp: App {
    var body: some Scene {
        WindowGroup {
            // Your backend's address; never Videxo's, and never an API key in the app.
            ContentView(backend: BackendClient(baseURL: URL(string: "http://localhost:3000")!))
        }
    }
}
