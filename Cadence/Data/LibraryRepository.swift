import Foundation
import GRDB

enum RepositoryError: Error {
    case missingRow
}

/// All SQL lives here. Queries are plain SQL on purpose: the joined "item" structs
/// decode straight from the column aliases.
struct LibraryRepository: Sendable {
    let writer: any DatabaseWriter

    var reader: any DatabaseReader { writer }

    // MARK: - SQL building blocks

    static let trackSelect = """
        SELECT track.id, track.title, track.artistId, artist.name AS artistName,
               track.albumId, album.title AS albumTitle, album.artworkFile AS artworkFile,
               track.trackNumber, track.discNumber, track.duration, track.fileName,
               track.playCount, track.addedAt, track.lastPlayedAt
        FROM track
        JOIN artist ON artist.id = track.artistId
        JOIN album ON album.id = track.albumId
        """

    // MARK: - Observed / one-shot fetches (run inside a Database access)

    static func allTracks(_ db: Database) throws -> [TrackItem] {
        try TrackItem.fetchAll(db, sql: trackSelect + " ORDER BY track.title COLLATE NOCASE")
    }

    static func recentTracks(_ db: Database) throws -> [TrackItem] {
        try TrackItem.fetchAll(db, sql: trackSelect + " ORDER BY track.addedAt DESC, track.id DESC LIMIT 20")
    }

    static func mostPlayed(_ db: Database) throws -> [TrackItem] {
        try TrackItem.fetchAll(
            db,
            sql: trackSelect + " WHERE track.playCount > 0 ORDER BY track.playCount DESC, track.lastPlayedAt DESC LIMIT 20"
        )
    }

    static func recentlyPlayed(_ db: Database) throws -> [TrackItem] {
        try TrackItem.fetchAll(
            db,
            sql: trackSelect + " WHERE track.lastPlayedAt IS NOT NULL ORDER BY track.lastPlayedAt DESC LIMIT 20"
        )
    }

    static func playlistTracks(_ db: Database, id: Int64) throws -> [TrackItem] {
        try TrackItem.fetchAll(
            db,
            sql: trackSelect + " JOIN playlistTrack ON playlistTrack.trackId = track.id WHERE playlistTrack.playlistId = ? ORDER BY playlistTrack.position",
            arguments: [id]
        )
    }

    static func fetchAlbums(
        _ db: Database,
        where clause: String = "",
        arguments: StatementArguments = StatementArguments()
    ) throws -> [AlbumItem] {
        try AlbumItem.fetchAll(
            db,
            sql: """
                SELECT album.id, album.title, album.artistId, artist.name AS artistName, album.artworkFile,
                       COUNT(track.id) AS trackCount, COALESCE(SUM(track.duration), 0) AS totalDuration
                FROM album
                JOIN artist ON artist.id = album.artistId
                LEFT JOIN track ON track.albumId = album.id
                \(clause)
                GROUP BY album.id
                ORDER BY album.title COLLATE NOCASE
                """,
            arguments: arguments
        )
    }

    static func fetchArtists(
        _ db: Database,
        where clause: String = "",
        arguments: StatementArguments = StatementArguments()
    ) throws -> [ArtistItem] {
        try ArtistItem.fetchAll(
            db,
            sql: """
                SELECT artist.id, artist.name,
                       COUNT(DISTINCT track.id) AS trackCount,
                       COUNT(DISTINCT track.albumId) AS albumCount,
                       (SELECT album.artworkFile FROM track t
                          JOIN album ON album.id = t.albumId
                         WHERE t.artistId = artist.id AND album.artworkFile IS NOT NULL
                         LIMIT 1) AS artworkFile
                FROM artist
                JOIN track ON track.artistId = artist.id
                \(clause)
                GROUP BY artist.id
                ORDER BY artist.name COLLATE NOCASE
                """,
            arguments: arguments
        )
    }

    static func allPlaylists(_ db: Database) throws -> [PlaylistItem] {
        try PlaylistItem.fetchAll(
            db,
            sql: """
                SELECT playlist.id, playlist.name,
                       COUNT(playlistTrack.id) AS trackCount,
                       (SELECT album.artworkFile FROM playlistTrack p2
                          JOIN track ON track.id = p2.trackId
                          JOIN album ON album.id = track.albumId
                         WHERE p2.playlistId = playlist.id AND album.artworkFile IS NOT NULL
                         ORDER BY p2.position
                         LIMIT 1) AS artworkFile
                FROM playlist
                LEFT JOIN playlistTrack ON playlistTrack.playlistId = playlist.id
                GROUP BY playlist.id
                ORDER BY playlist.createdAt DESC, playlist.id DESC
                """
        )
    }

    // MARK: - Search

    func search(_ rawQuery: String) async throws -> SearchResults {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return .empty }
        let pattern = "%" + Self.escapeLike(query) + "%"

        return try await reader.read { db in
            let tracks = try TrackItem.fetchAll(
                db,
                sql: Self.trackSelect + """

                     WHERE track.title LIKE ? ESCAPE '\\'
                        OR artist.name LIKE ? ESCAPE '\\'
                        OR album.title LIKE ? ESCAPE '\\'
                     ORDER BY track.title COLLATE NOCASE
                     LIMIT 100
                    """,
                arguments: [pattern, pattern, pattern]
            )
            let albums = try Self.fetchAlbums(
                db,
                where: "WHERE album.title LIKE ? ESCAPE '\\' OR artist.name LIKE ? ESCAPE '\\'",
                arguments: [pattern, pattern]
            )
            let artists = try Self.fetchArtists(
                db,
                where: "WHERE artist.name LIKE ? ESCAPE '\\'",
                arguments: [pattern]
            )
            return SearchResults(tracks: tracks, albums: albums, artists: artists)
        }
    }

    static func escapeLike(_ text: String) -> String {
        text
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "%", with: "\\%")
            .replacingOccurrences(of: "_", with: "\\_")
    }

    // MARK: - Import

    func trackExists(hash: String) async throws -> Bool {
        try await reader.read { db in
            try Int.fetchOne(db, sql: "SELECT 1 FROM track WHERE contentHash = ?", arguments: [hash]) != nil
        }
    }

    @discardableResult
    func insert(_ imported: ImportedTrack) async throws -> Int64 {
        try await writer.write { db in
            let artistId = try Self.upsertArtist(db, name: imported.artist)
            let albumArtistId = try Self.upsertArtist(db, name: imported.albumArtist)
            let albumId = try Self.upsertAlbum(
                db, title: imported.album, artistId: albumArtistId, artworkFile: imported.artworkFile
            )
            try db.execute(
                sql: """
                    INSERT INTO track
                        (title, artistId, albumId, trackNumber, discNumber, duration,
                         fileName, contentHash, fileSize, addedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                arguments: [
                    imported.title, artistId, albumId, imported.trackNumber, imported.discNumber,
                    imported.duration, imported.fileName, imported.contentHash, imported.fileSize, Date(),
                ]
            )
            return db.lastInsertedRowID
        }
    }

    private static func upsertArtist(_ db: Database, name: String) throws -> Int64 {
        try db.execute(sql: "INSERT OR IGNORE INTO artist(name) VALUES (?)", arguments: [name])
        guard let id = try Int64.fetchOne(db, sql: "SELECT id FROM artist WHERE name = ?", arguments: [name]) else {
            throw RepositoryError.missingRow
        }
        return id
    }

    private static func upsertAlbum(
        _ db: Database, title: String, artistId: Int64, artworkFile: String?
    ) throws -> Int64 {
        try db.execute(
            sql: "INSERT OR IGNORE INTO album(title, artistId) VALUES (?, ?)",
            arguments: [title, artistId]
        )
        if let artworkFile {
            try db.execute(
                sql: "UPDATE album SET artworkFile = ? WHERE title = ? AND artistId = ? AND artworkFile IS NULL",
                arguments: [artworkFile, title, artistId]
            )
        }
        guard let id = try Int64.fetchOne(
            db,
            sql: "SELECT id FROM album WHERE title = ? AND artistId = ?",
            arguments: [title, artistId]
        ) else {
            throw RepositoryError.missingRow
        }
        return id
    }

    // MARK: - Delete

    /// Removes the track, prunes albums/artists left empty, and reports which files are now unused.
    func deleteTrack(id: Int64) async throws -> RemovedFiles {
        try await writer.write { db in
            guard let fileName = try String.fetchOne(
                db, sql: "SELECT fileName FROM track WHERE id = ?", arguments: [id]
            ) else {
                return RemovedFiles(audioFile: nil, artworkFiles: [])
            }
            try db.execute(sql: "DELETE FROM track WHERE id = ?", arguments: [id])

            let orphanArtwork = try String.fetchAll(
                db,
                sql: "SELECT artworkFile FROM album WHERE artworkFile IS NOT NULL AND id NOT IN (SELECT albumId FROM track)"
            )
            try db.execute(sql: "DELETE FROM album WHERE id NOT IN (SELECT albumId FROM track)")
            try db.execute(
                sql: "DELETE FROM artist WHERE id NOT IN (SELECT artistId FROM track) AND id NOT IN (SELECT artistId FROM album)"
            )

            var unusedArtwork: [String] = []
            for file in Set(orphanArtwork) {
                let stillUsed = try Int.fetchOne(
                    db, sql: "SELECT 1 FROM album WHERE artworkFile = ?", arguments: [file]
                ) != nil
                if !stillUsed { unusedArtwork.append(file) }
            }
            return RemovedFiles(audioFile: fileName, artworkFiles: unusedArtwork)
        }
    }

    // MARK: - Playlists

    func createPlaylist(name: String, trackIDs: [Int64]) async throws -> Int64 {
        try await writer.write { db in
            try db.execute(
                sql: "INSERT INTO playlist(name, createdAt) VALUES (?, ?)",
                arguments: [name, Date()]
            )
            let id = db.lastInsertedRowID
            try Self.append(db, trackIDs: trackIDs, toPlaylist: id)
            return id
        }
    }

    func deletePlaylist(id: Int64) async throws {
        try await writer.write { db in
            try db.execute(sql: "DELETE FROM playlist WHERE id = ?", arguments: [id])
        }
    }

    func addToPlaylist(trackIDs: [Int64], playlistID: Int64) async throws {
        try await writer.write { db in
            try Self.append(db, trackIDs: trackIDs, toPlaylist: playlistID)
        }
    }

    func removeFromPlaylist(trackID: Int64, playlistID: Int64) async throws {
        try await writer.write { db in
            try db.execute(
                sql: "DELETE FROM playlistTrack WHERE playlistId = ? AND trackId = ?",
                arguments: [playlistID, trackID]
            )
        }
    }

    private static func append(_ db: Database, trackIDs: [Int64], toPlaylist playlistID: Int64) throws {
        var position = try Int.fetchOne(
            db,
            sql: "SELECT COALESCE(MAX(position), -1) + 1 FROM playlistTrack WHERE playlistId = ?",
            arguments: [playlistID]
        ) ?? 0
        for trackID in trackIDs {
            try db.execute(
                sql: "INSERT OR IGNORE INTO playlistTrack(playlistId, trackId, position) VALUES (?, ?, ?)",
                arguments: [playlistID, trackID, position]
            )
            if db.changesCount > 0 { position += 1 }
        }
    }

    // MARK: - Play history

    func recordPlay(trackID: Int64) {
        let now = Date()
        writer.asyncWrite({ db in
            try db.execute(
                sql: "UPDATE track SET playCount = playCount + 1, lastPlayedAt = ? WHERE id = ?",
                arguments: [now, trackID]
            )
        }, completion: { _, _ in })
    }

    // MARK: - Queue persistence

    /// Replaces the stored queue. Uses `asyncWrite` so successive calls apply in call order.
    func saveQueue(trackIDs: [Int64]) {
        writer.asyncWrite({ db in
            try db.execute(sql: "DELETE FROM queueItem")
            for (position, id) in trackIDs.enumerated() {
                try db.execute(
                    sql: "INSERT INTO queueItem(trackId, position) VALUES (?, ?)",
                    arguments: [id, position]
                )
            }
        }, completion: { _, _ in })
    }

    func savePlaybackState(index: Int?, position: Double, repeatMode: RepeatMode) {
        writer.asyncWrite({ db in
            try Self.setState(db, "queueIndex", String(index ?? 0))
            try Self.setState(db, "queuePosition", String(position))
            try Self.setState(db, "repeatMode", repeatMode.rawValue)
        }, completion: { _, _ in })
    }

    func loadPersistedQueue() async throws -> PersistedQueue? {
        try await reader.read { db -> PersistedQueue? in
            let items = try TrackItem.fetchAll(
                db,
                sql: Self.trackSelect + " JOIN queueItem ON queueItem.trackId = track.id ORDER BY queueItem.position"
            )
            guard !items.isEmpty else { return nil }
            let rawIndex = try Self.state(db, "queueIndex")
            let rawPosition = try Self.state(db, "queuePosition")
            let rawRepeat = try Self.state(db, "repeatMode")
            let index = min(max(Int(rawIndex ?? "") ?? 0, 0), items.count - 1)
            return PersistedQueue(
                items: items,
                index: index,
                position: Double(rawPosition ?? "") ?? 0,
                repeatMode: RepeatMode(rawValue: rawRepeat ?? "") ?? .off
            )
        }
    }

    private static func setState(_ db: Database, _ name: String, _ value: String) throws {
        try db.execute(
            sql: """
                INSERT INTO appState(name, value) VALUES (?, ?)
                ON CONFLICT(name) DO UPDATE SET value = excluded.value
                """,
            arguments: [name, value]
        )
    }

    private static func state(_ db: Database, _ name: String) throws -> String? {
        try String.fetchOne(db, sql: "SELECT value FROM appState WHERE name = ?", arguments: [name])
    }
}
