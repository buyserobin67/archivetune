import SwiftUI

@main
struct CadenceApp: App {
    @State private var model: AppModel?
    @State private var startupError: String?

    init() {
        var created: AppModel?
        var failure: String?
        do {
            created = try AppModel.live()
        } catch {
            failure = String(describing: error)
        }
        _model = State(initialValue: created)
        _startupError = State(initialValue: failure)
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if let model {
                    RootView()
                        .environment(model)
                } else {
                    StartupErrorView(message: startupError ?? "Unknown error")
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}

private struct StartupErrorView: View {
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text("Cadence couldn't open its library")
                .font(.headline)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }
}
