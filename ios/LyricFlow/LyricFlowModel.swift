import AuthenticationServices
import CryptoKit
import Foundation
import SpotifyLogin
import UIKit
import WebKit

final class LyricFlowModel: NSObject, ObservableObject {
    static let siteURL = URL(string: "https://casperboi14.github.io/LyricFlow/")!
    static let spotifyRedirectURL = URL(string: "com.pxlwebworks.lyricflow://spotify-callback")!
    static let scopes: [Scope] = [
        .playlistReadPrivate, .playlistReadCollaborative, .userReadPrivate,
        .userReadEmail, .userReadPlaybackState, .userModifyPlaybackState, .streaming
    ]

    let webView: WKWebView
    private var spotifyManager: SessionManager?
    private var webAuthSession: ASWebAuthenticationSession?
    private var currentClientID: String?
    private var webVerifier: String?
    private var webState: String?
    private var pendingResult: [String: Any]?
    private var activeObserver: NSObjectProtocol?

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.isElementFullscreenEnabled = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        configuration.userContentController.add(self, name: "lyricFlowSpotify")
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        activeObserver = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.deliverPendingResult()
        }
        webView.load(URLRequest(url: Self.siteURL))
    }

    deinit {
        if let activeObserver = activeObserver { NotificationCenter.default.removeObserver(activeObserver) }
    }

    func handleSpotifyCallback(_ url: URL) {
        guard url.scheme == Self.spotifyRedirectURL.scheme,
              url.host == Self.spotifyRedirectURL.host else { return }
        _ = spotifyManager?.openURL(url)
    }

    private func startAppLogin(clientID: String) {
        let configuration = Configuration(clientID: clientID, redirectURL: Self.spotifyRedirectURL)
        let manager = SessionManager(configuration: configuration, delegate: self)
        spotifyManager = manager
        guard manager.isSpotifyAppInstalled else {
            sendError("Spotify is not installed on this iPad. Install it or choose website login.")
            return
        }
        manager.initiateSession(with: Self.scopes, authorizationFlow: .clientOnlyFailsIfNotInstalled)
    }

    private func startWebLogin(clientID: String) {
        let verifier = Self.randomURLSafeString()
        let state = Self.randomURLSafeString()
        webVerifier = verifier
        webState = state
        let digest = SHA256.hash(data: Data(verifier.utf8))
        let challenge = Self.base64URL(Data(digest))

        var url = URLComponents(string: "https://accounts.spotify.com/authorize")!
        url.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: Self.spotifyRedirectURL.absoluteString),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "scope", value: Self.scopes.map(\.name).joined(separator: " "))
        ]

        guard let authorizationURL = url.url else {
            sendError("Could not prepare Spotify website login.")
            return
        }
        let session = ASWebAuthenticationSession(url: authorizationURL, callbackURLScheme: Self.spotifyRedirectURL.scheme) { [weak self] callback, error in
            DispatchQueue.main.async { self?.completeWebLogin(callback: callback, error: error) }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        webAuthSession = session
        if !session.start() { sendError("Could not open Spotify website login.") }
    }

    private func completeWebLogin(callback: URL?, error: Error?) {
        webAuthSession = nil
        if let error = error {
            sendError(error.localizedDescription)
            return
        }
        guard let callback = callback,
              let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              query.first(where: { $0.name == "state" })?.value == webState,
              let code = query.first(where: { $0.name == "code" })?.value,
              let verifier = webVerifier,
              let clientID = currentClientID else {
            sendError("Spotify website login did not return a valid authorization code.")
            return
        }
        webVerifier = nil
        webState = nil
        Task { await exchangeWebCode(code, verifier: verifier, clientID: clientID) }
    }

    private func exchangeWebCode(_ code: String, verifier: String, clientID: String) async {
        do {
            var request = URLRequest(url: URL(string: "https://accounts.spotify.com/api/token")!)
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            var form = URLComponents()
            form.queryItems = [
                URLQueryItem(name: "grant_type", value: "authorization_code"),
                URLQueryItem(name: "code", value: code),
                URLQueryItem(name: "redirect_uri", value: Self.spotifyRedirectURL.absoluteString),
                URLQueryItem(name: "client_id", value: clientID),
                URLQueryItem(name: "code_verifier", value: verifier)
            ]
            request.httpBody = form.percentEncodedQuery?.data(using: .utf8)
            let (data, response) = try await URLSession.shared.data(for: request)
            let body = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let status = response as? HTTPURLResponse, (200..<300).contains(status.statusCode),
                  let body = body,
                  let access = body["access_token"] as? String,
                  let refresh = body["refresh_token"] as? String,
                  let expiresIn = body["expires_in"] as? Int else {
                throw NSError(domain: "LyricFlow", code: 1, userInfo: [NSLocalizedDescriptionKey: "Spotify could not complete website login."])
            }
            let scope = (body["scope"] as? String) ?? Self.scopes.map(\.name).joined(separator: " ")
            DispatchQueue.main.async { [weak self] in
                self?.sendTokens(access: access, refresh: refresh, expiresAt: Date().addingTimeInterval(TimeInterval(expiresIn)), scope: scope)
            }
        } catch {
            DispatchQueue.main.async { [weak self] in self?.sendError(error.localizedDescription) }
        }
    }

    private func sendTokens(access: String, refresh: String, expiresAt: Date, scope: String) {
        sendResult(["tokens": [
            "access_token": access,
            "refresh_token": refresh,
            "expires_at": Int(expiresAt.timeIntervalSince1970 * 1000),
            "scope": scope
        ]])
    }

    private func sendError(_ message: String) { sendResult(["error": message]) }

    private func sendResult(_ result: [String: Any]) {
        pendingResult = result
        deliverPendingResult()
    }

    private func deliverPendingResult() {
        guard let result = pendingResult, !webView.isLoading,
              let url = webView.url, Self.isTrustedURL(url),
              let data = try? JSONSerialization.data(withJSONObject: result),
              let json = String(data: data, encoding: .utf8) else { return }
        let script = "window.__lyricFlowPendingAuth = \(json); window.dispatchEvent(new CustomEvent('lyricflow:spotify-native-auth', { detail: window.__lyricFlowPendingAuth }))"
        webView.evaluateJavaScript(script) { [weak self] _, error in
            if error == nil { self?.pendingResult = nil }
        }
    }

    private static func isTrustedURL(_ url: URL) -> Bool {
        url.scheme == siteURL.scheme && url.host == siteURL.host && url.path.hasPrefix(siteURL.path)
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private static func randomURLSafeString() -> String {
        base64URL(Data((0..<32).map { _ in UInt8.random(in: 0...255) }))
    }
}

extension LyricFlowModel: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "lyricFlowSpotify", message.frameInfo.isMainFrame,
              let url = webView.url, Self.isTrustedURL(url),
              message.frameInfo.securityOrigin.host == Self.siteURL.host,
              let body = message.body as? [String: String], body["action"] == "login",
              let clientID = body["clientId"],
              clientID.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil else { return }
        currentClientID = clientID
        if body["mode"] == "app" { startAppLogin(clientID: clientID) }
        else if body["mode"] == "web" { startWebLogin(clientID: clientID) }
    }
}

extension LyricFlowModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { deliverPendingResult() }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, action.navigationType == .linkActivated, !Self.isTrustedURL(url) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }
}

extension LyricFlowModel: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        webView.window ?? UIWindow()
    }
}

extension LyricFlowModel: SessionManagerDelegate {
    func sessionManager(manager: SessionManager, didInitiate session: Session) {
        DispatchQueue.main.async { [weak self] in
            let scopes = session.scopes.isEmpty ? Self.scopes : session.scopes
            self?.sendTokens(access: session.accessToken, refresh: session.refreshToken,
                             expiresAt: session.expirationDate,
                             scope: scopes.map(\.name).joined(separator: " "))
        }
    }

    func sessionManager(manager: SessionManager, didFailWith error: Error) {
        DispatchQueue.main.async { [weak self] in self?.sendError(error.localizedDescription) }
    }
}
