import SwiftUI
import WebKit

@main
struct LyricFlowApp: App {
    @StateObject private var model = LyricFlowModel()

    var body: some Scene {
        WindowGroup {
            LyricFlowWebView(model: model)
                .ignoresSafeArea()
                .onOpenURL { model.handleSpotifyCallback($0) }
        }
    }
}

struct LyricFlowWebView: UIViewRepresentable {
    @ObservedObject var model: LyricFlowModel

    func makeUIView(context: Context) -> WKWebView { model.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
