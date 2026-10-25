import Foundation
import GRDB

enum RepeatMode: String, Sendable, CaseIterable {
    case off, all, one

    var next: RepeatMode {
        switch self {
        case .off: return .all
        case .all: return .one
        case .one: return .off
        }
    }
}

/// A track joined with its artist and album. Property order matters for the memberwise init.
struct TrackItem: Identifiable, Hashable, Sendable, Codable, FetchableRecord {
    var id: Int64
    var title: String
    var artistId: Int64
    var artistName: String
    var albumId: Int64
    var albumTitle: String
    var artworkFile: String?
    var trackNumber: Int?
    var discNumber: Int?
    var duration: Double
    var fileName: String
    var playCount: Int
    var addedAt: Date
    var lastPlayedAt: Date?
}

struct AlbumItem: Identifiable, Hashable, Sendable, Codable, FetchableRecord {
    var id: Int64
    var title: String
    var artistId: Int64
    var artistName: String
    var artworkFile: String?
    var trackCount: Int
    var totalDuration: Double
}

struct ArtistItem: Identifiable, Hashable, Sendable, Codable, FetchableRecord {
    var id: Int64
    var name: String
    var trackCount: Int
    var albumCount: Int
    var artworkFile: String?
}

struct PlaylistItem: Identifiable, Hashable, Sendable, Codable, FetchableRecord {
    var id: Int64
    var name: String
    var trackCount: Int
    var artworkFile: String?
}

struct SearchResults: Sendable {
    var tracks: [TrackItem]
    var albums: [AlbumItem]
    var artists: [ArtistItem]

    static let empty = SearchResults(tracks: [], albums: [], artists: [])
    var isEmpty: Bool { tracks.isEmpty && albums.isEmpty && artists.isEmpty }
}

/// Everything the importer learned about one file, ready to be written to the database.
struct ImportedTrack: Sendable {
    var title: String
    var artist: String
    var albumArtist: String
    var album: String
    var trackNumber: Int?
    var discNumber: Int?
    var duration: Double
    var fileName: String
    var contentHash: String
    var fileSize: Int
    var artworkFile: String?
}

struct ImportProgress: Sendable, Equatable {
    var done: Int
    var total: Int
}

struct ImportSummary: Sendable, Equatable {
    var added = 0
    var duplicates = 0
    var failed = 0
    var unsupported = 0

    var message: String {
        var parts = ["Added \(added) \(added == 1 ? "song" : "songs")"]
        if duplicates > 0 { parts.append("\(duplicates) already in library") }
        if failed > 0 { parts.append("\(failed) failed") }
        if unsupported > 0 { parts.append("\(unsupported) unsupported") }
        return parts.joined(separator: " · ")
    }
}

struct PersistedQueue: Sendable {
    var items: [TrackItem]
    var index: Int
    var position: Double
    var repeatMode: RepeatMode
}

struct RemovedFiles: Sendable {
    var audioFile: String?
    var artworkFiles: [String]
}
