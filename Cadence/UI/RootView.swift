import SwiftUI
import UniformTypeIdentifiers

enum AppTab: Hashable {
    case home, library, search
}

struct RootView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase

    @State private var tab: AppTab = .home
    @State private var playlistName = ""

    var body: some View {
        @Bindable var app = app

        TabView(selection: $tab) {
            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(AppTab.home)
            LibraryView()
                .tabItem { Label("Library", systemImage: "music.note.list") }
                .tag(AppTab.library)
            SearchView()
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
                .tag(AppTab.search)
        }
        .tint(Theme.accent)
        .sheet(isPresented: $app.showNowPlaying) {
            NowPlayingView()
                .presentationDragIndicator(.visible)
        }
        .fileImporter(
            isPresented: Binding(
                get: { app.pickerMode != nil },
                set: { if !$0 { app.pickerMode = nil } }
            ),
            allowedContentTypes: app.pickerMode == .folder ? [.folder] : [.audio],
            allowsMultipleSelection: app.pickerMode != .folder
        ) { result in
            app.handlePicked(result)
        }
        .overlay(alignment: .top) {
            ImportBanner()
        }
        .alert(
            "Cadence",
            isPresented: Binding(
                get: { app.alertMessage != nil },
                set: { if !$0 { app.alertMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(app.alertMessage ?? "")
        }
        .alert(
            "New Playlist",
            isPresented: Binding(
                get: { app.newPlaylistRequest != nil },
                set: { if !$0 { app.newPlaylistRequest = nil } }
            )
        ) {
            TextField("Name", text: $playlistName)
            Button("Create") {
                let request = app.newPlaylistRequest
                let name = playlistName
                playlistName = ""
                Task { await app.createPlaylist(named: name, trackIDs: request?.trackIDs ?? []) }
            }
            Button("Cancel", role: .cancel) { playlistName = "" }
        }
        .confirmationDialog(
            "Delete this song?",
            isPresented: Binding(
                get: { app.pendingDelete != nil },
                set: { if !$0 { app.pendingDelete = nil } }
            ),
            titleVisibility: .visible,
            presenting: app.pendingDelete
        ) { track in
            Button("Delete “\(track.title)”", role: .destructive) {
                Task { await app.delete(track) }
            }
        } message: { _ in
            Text("The copy inside Cadence is removed. Your original file isn't touched.")
        }
        .task { await app.start() }
        .onChange(of: app.engine.errorMessage) { _, message in
            guard let message else { return }
            app.alertMessage = message
            app.engine.clearError()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { app.engine.persistNow() }
        }
    }
}

private struct ImportBanner: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        if let progress = app.library.importProgress {
            HStack(spacing: 10) {
                ProgressView()
                    .tint(Theme.accent)
                Text(progress.total > 0 ? "Importing \(progress.done) of \(progress.total)" : "Preparing import…")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Theme.hairline))
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}
