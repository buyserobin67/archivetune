import Foundation
import GRDB
import Observation

enum ImportMode {
    case files, folder
}

struct NewPlaylistRequest: Identifiable {
    let id = UUID()
    var trackIDs: [Int64]
}

/// Composition root plus the UI-facing façade for anything that can fail.
@MainActor @Observable
final class AppModel {
    let paths: AppPaths
    let library: LibraryStore
    let engine: PlaybackEngine

    var pickerMode: ImportMode?
    var showNowPlaying = false
    var alertMessage: String?
    var pendingDelete: TrackItem?
    var newPlaylistRequest: NewPlaylistRequest?

    @ObservationIgnored private var started = false

    init(paths: AppPaths, writer: any DatabaseWriter) {
        let repository = LibraryRepository(writer: writer)
        self.paths = paths
        self.library = LibraryStore(repository: repository, paths: paths)
        self.engine = PlaybackEngine(repository: repository, paths: paths)
    }

    static func live() throws -> AppModel {
        let paths = try AppPaths.standard()
        let pool = try AppDatabase.open(at: paths.databaseURL)
        return AppModel(paths: paths, writer: pool)
    }

    func start() async {
        guard !started else { return }
        started = true
        library.start()
        await engine.restore()
    }

    // MARK: - Import

    func handlePicked(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard !urls.isEmpty, library.importProgress == nil else { return }
            Task { [self] in
                let summary = await library.importFiles(urls)
                alertMessage = summary.message
            }
        case .failure(let error):
            alertMessage = error.localizedDescription
        }
    }

    // MARK: - Mutations

    func delete(_ track: TrackItem) async {
        engine.removeTracks(withIDs: [track.id])
        do {
            try await library.deleteTrack(id: track.id)
        } catch {
            alertMessage = "Couldn't delete the song: \(error.localizedDescription)"
        }
    }

    func createPlaylist(named name: String, trackIDs: [Int64]) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await perform { try await library.createPlaylist(name: trimmed, trackIDs: trackIDs) }
    }

    func deletePlaylist(_ playlist: PlaylistItem) async {
        await perform { try await library.deletePlaylist(id: playlist.id) }
    }

    func add(trackIDs: [Int64], to playlist: PlaylistItem) async {
        await perform { try await library.addToPlaylist(trackIDs: trackIDs, playlistID: playlist.id) }
    }

    func remove(trackID: Int64, from playlist: PlaylistItem) async {
        await perform { try await library.removeFromPlaylist(trackID: trackID, playlistID: playlist.id) }
    }

    private func perform(_ work: () async throws -> Void) async {
        do {
            try await work()
        } catch {
            alertMessage = error.localizedDescription
        }
    }
}
