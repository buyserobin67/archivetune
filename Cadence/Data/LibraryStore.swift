import Foundation
import GRDB
import Observation

/// Main-actor view of the library. Lists are driven by GRDB `ValueObservation`s, so any
/// write (import, delete, playlist edit) shows up in the UI without manual refreshes.
@MainActor @Observable
final class LibraryStore {
    private(set) var tracks: [TrackItem] = []
    private(set) var albums: [AlbumItem] = []
    private(set) var artists: [ArtistItem] = []
    private(set) var playlists: [PlaylistItem] = []
    private(set) var recentTracks: [TrackItem] = []
    private(set) var mostPlayed: [TrackItem] = []
    private(set) var recentlyPlayed: [TrackItem] = []
    private(set) var hasLoaded = false
    private(set) var importProgress: ImportProgress?

    let repository: LibraryRepository
    @ObservationIgnored private let paths: AppPaths
    @ObservationIgnored private let importer: LibraryImporter
    @ObservationIgnored private var observationTasks: [Task<Void, Never>] = []

    init(repository: LibraryRepository, paths: AppPaths) {
        self.repository = repository
        self.paths = paths
        self.importer = LibraryImporter(repository: repository, paths: paths)
    }

    func start() {
        guard observationTasks.isEmpty else { return }

        observe({ db in try LibraryRepository.allTracks(db) }) { store, value in
            store.tracks = value
            store.hasLoaded = true
        }
        observe({ db in try LibraryRepository.fetchAlbums(db) }) { store, value in store.albums = value }
        observe({ db in try LibraryRepository.fetchArtists(db) }) { store, value in store.artists = value }
        observe({ db in try LibraryRepository.allPlaylists(db) }) { store, value in store.playlists = value }
        observe({ db in try LibraryRepository.recentTracks(db) }) { store, value in store.recentTracks = value }
        observe({ db in try LibraryRepository.mostPlayed(db) }) { store, value in store.mostPlayed = value }
        observe({ db in try LibraryRepository.recentlyPlayed(db) }) { store, value in store.recentlyPlayed = value }
    }

    private func observe<Value: Sendable>(
        _ fetch: @escaping @Sendable (Database) throws -> Value,
        apply: @escaping @MainActor (LibraryStore, Value) -> Void
    ) {
        let observation = ValueObservation.tracking(fetch)
        let reader = repository.reader
        let task = Task { [weak self] in
            do {
                for try await value in observation.values(in: reader) {
                    guard let self else { return }
                    apply(self, value)
                }
            } catch {
                // Observation ended (database closed or task cancelled); nothing to recover.
            }
        }
        observationTasks.append(task)
    }

    func observePlaylistTracks(id: Int64) -> AsyncValueObservation<[TrackItem]> {
        ValueObservation
            .tracking { db in try LibraryRepository.playlistTracks(db, id: id) }
            .values(in: repository.reader)
    }

    func search(_ query: String) async -> SearchResults {
        (try? await repository.search(query)) ?? .empty
    }

    // MARK: - Import

    func importFiles(_ urls: [URL]) async -> ImportSummary {
        importProgress = ImportProgress(done: 0, total: 0)
        let summary = await importer.importItems(at: urls) { [weak self] progress in
            self?.importProgress = progress
        }
        importProgress = nil
        return summary
    }

    // MARK: - Mutations

    func deleteTrack(id: Int64) async throws {
        let removed = try await repository.deleteTrack(id: id)
        let fileManager = FileManager.default
        if let audio = removed.audioFile {
            try? fileManager.removeItem(at: paths.audioURL(audio))
        }
        for artwork in removed.artworkFiles {
            try? fileManager.removeItem(at: paths.artworkURL(artwork))
        }
    }

    func createPlaylist(name: String, trackIDs: [Int64]) async throws {
        _ = try await repository.createPlaylist(name: name, trackIDs: trackIDs)
    }

    func deletePlaylist(id: Int64) async throws {
        try await repository.deletePlaylist(id: id)
    }

    func addToPlaylist(trackIDs: [Int64], playlistID: Int64) async throws {
        try await repository.addToPlaylist(trackIDs: trackIDs, playlistID: playlistID)
    }

    func removeFromPlaylist(trackID: Int64, playlistID: Int64) async throws {
        try await repository.removeFromPlaylist(trackID: trackID, playlistID: playlistID)
    }
}
