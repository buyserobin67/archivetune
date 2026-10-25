import GRDB
import XCTest
@testable import Cadence

final class LibraryRepositoryTests: XCTestCase {
    private func makeRepository() throws -> LibraryRepository {
        LibraryRepository(writer: try AppDatabase.inMemory())
    }

    private func imported(
        _ title: String, artist: String = "Artist", album: String = "Album",
        hash: String? = nil, artwork: String? = nil, track: Int? = nil
    ) -> ImportedTrack {
        ImportedTrack(
            title: title, artist: artist, albumArtist: artist, album: album,
            trackNumber: track, discNumber: nil, duration: 120,
            fileName: "\(title).mp3", contentHash: hash ?? "hash-\(title)",
            fileSize: 1, artworkFile: artwork
        )
    }

    func testTracksOfSameAlbumAreGrouped() async throws {
        let repo = try makeRepository()
        try await repo.insert(imported("One", track: 1))
        try await repo.insert(imported("Two", track: 2))

        let albums = try await repo.reader.read { try LibraryRepository.fetchAlbums($0) }
        XCTAssertEqual(albums.count, 1)
        XCTAssertEqual(albums.first?.trackCount, 2)

        let artists = try await repo.reader.read { try LibraryRepository.fetchArtists($0) }
        XCTAssertEqual(artists.count, 1)
        XCTAssertEqual(artists.first?.trackCount, 2)
    }

    func testArtistAndAlbumNamesAreCaseInsensitive() async throws {
        let repo = try makeRepository()
        try await repo.insert(imported("One", artist: "Daft Punk", album: "Discovery"))
        try await repo.insert(imported("Two", artist: "daft punk", album: "DISCOVERY"))

        let artists = try await repo.reader.read { try LibraryRepository.fetchArtists($0) }
        let albums = try await repo.reader.read { try LibraryRepository.fetchAlbums($0) }
        XCTAssertEqual(artists.count, 1)
        XCTAssertEqual(albums.count, 1)
    }

    func testDuplicateHashIsDetected() async throws {
        let repo = try makeRepository()
        try await repo.insert(imported("One", hash: "abc"))
        let exists = try await repo.trackExists(hash: "abc")
        let missing = try await repo.trackExists(hash: "zzz")
        XCTAssertTrue(exists)
        XCTAssertFalse(missing)
    }

    func testDeletePrunesEmptyAlbumsAndArtistsAndReportsFiles() async throws {
        let repo = try makeRepository()
        let id = try await repo.insert(imported("Solo", artwork: "cover.jpg"))
        let removed = try await repo.deleteTrack(id: id)

        XCTAssertEqual(removed.audioFile, "Solo.mp3")
        XCTAssertEqual(removed.artworkFiles, ["cover.jpg"])
        let tracks = try await repo.reader.read { try LibraryRepository.allTracks($0) }
        let albums = try await repo.reader.read { try LibraryRepository.fetchAlbums($0) }
        let artists = try await repo.reader.read { try LibraryRepository.fetchArtists($0) }
        XCTAssertTrue(tracks.isEmpty && albums.isEmpty && artists.isEmpty)
    }

    func testDeleteKeepsSharedAlbum() async throws {
        let repo = try makeRepository()
        let first = try await repo.insert(imported("One", artwork: "cover.jpg"))
        try await repo.insert(imported("Two"))
        let removed = try await repo.deleteTrack(id: first)

        XCTAssertTrue(removed.artworkFiles.isEmpty)
        let albums = try await repo.reader.read { try LibraryRepository.fetchAlbums($0) }
        XCTAssertEqual(albums.first?.trackCount, 1)
    }

    func testSearchMatchesTitleArtistAndAlbumAndEscapesWildcards() async throws {
        let repo = try makeRepository()
        try await repo.insert(imported("Midnight City", artist: "M83", album: "Hurry Up"))
        try await repo.insert(imported("100% Pure", artist: "Someone", album: "Else"))

        let byArtist = try await repo.search("m83")
        XCTAssertEqual(byArtist.tracks.map(\.title), ["Midnight City"])
        XCTAssertEqual(byArtist.artists.count, 1)

        let percent = try await repo.search("%")
        XCTAssertEqual(percent.tracks.map(\.title), ["100% Pure"])

        let none = try await repo.search("zzzz")
        XCTAssertTrue(none.isEmpty)
    }

    func testPlaylistKeepsOrderAndIgnoresDuplicates() async throws {
        let repo = try makeRepository()
        let a = try await repo.insert(imported("A"))
        let b = try await repo.insert(imported("B"))
        let c = try await repo.insert(imported("C"))

        let playlist = try await repo.createPlaylist(name: "Mix", trackIDs: [c, a])
        try await repo.addToPlaylist(trackIDs: [a, b], playlistID: playlist)

        let titles = try await repo.reader.read {
            try LibraryRepository.playlistTracks($0, id: playlist).map(\.title)
        }
        XCTAssertEqual(titles, ["C", "A", "B"])

        let playlists = try await repo.reader.read { try LibraryRepository.allPlaylists($0) }
        XCTAssertEqual(playlists.first?.trackCount, 3)
    }

    func testQueueAndPlaybackStateRoundTrip() async throws {
        let repo = try makeRepository()
        let a = try await repo.insert(imported("A"))
        let b = try await repo.insert(imported("B"))

        repo.saveQueue(trackIDs: [b, a, b])
        repo.savePlaybackState(index: 1, position: 42.5, repeatMode: .all)

        let restored = try await repo.loadPersistedQueue()
        XCTAssertEqual(restored?.items.map(\.title), ["B", "A", "B"])
        XCTAssertEqual(restored?.index, 1)
        XCTAssertEqual(restored?.position, 42.5)
        XCTAssertEqual(restored?.repeatMode, .all)
    }

    func testDeletingTrackRemovesItFromPersistedQueue() async throws {
        let repo = try makeRepository()
        let a = try await repo.insert(imported("A"))
        let b = try await repo.insert(imported("B"))
        repo.saveQueue(trackIDs: [a, b])
        _ = try await repo.deleteTrack(id: a)

        let restored = try await repo.loadPersistedQueue()
        XCTAssertEqual(restored?.items.map(\.title), ["B"])
    }

    func testEmptyQueueRestoresAsNil() async throws {
        let repo = try makeRepository()
        let restored = try await repo.loadPersistedQueue()
        XCTAssertNil(restored)
    }
}
