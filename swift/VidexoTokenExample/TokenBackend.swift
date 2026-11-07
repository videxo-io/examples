import Foundation
import Videxo

// The calls to your backend. It keeps the API key: it mints the client tokens and creates the jobs, for
// the user your own sign-in says is asking. The Express example answers these two routes.

struct MintedToken: Decodable, Sendable {
    let id: String
    let token: String
}

struct FollowedJob: Decodable, Sendable {
    let jobId: String
    let id: String
    let token: String

    enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case id, token
    }
}

struct TokenBackend: Sendable {
    /// Your server, for example https://app.example.com. In the simulator, http://localhost:3000 reaches a local one.
    let baseURL: URL
    /// The signed-in user's session with your server, from your own sign-in. Never an API key.
    let session: String

    // snippet:start mint
    /// A new client token for one upload.
    func uploadToken() async throws -> MintedToken {
        try await post("api/client-tokens", [:])
    }

    /// The next token of the chain. `VidexoClient` asks for it when the current one is about to end.
    func refresh(tokenId: String?) async throws -> FreshToken {
        guard let tokenId else { throw URLError(.userAuthenticationRequired) }
        let next: MintedToken = try await post("api/client-tokens", ["continues": tokenId])
        return FreshToken(token: next.token, id: next.id)
    }

    /// Your backend creates the job from the upload, with its API key, and answers a continuation that may read it.
    func createJob(continues tokenId: String, inputURL: String) async throws -> FollowedJob {
        try await post("api/client-tokens/jobs", ["continues": tokenId, "input_url": inputURL])
    }
    // snippet:end mint

    private func post<T: Decodable>(_ path: String, _ body: [String: String]) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("Bearer \(session)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
