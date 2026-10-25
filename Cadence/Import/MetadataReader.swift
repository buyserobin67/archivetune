import AVFoundation
import Foundation

struct ExtractedMetadata: Sendable {
    var title: String?
    var artist: String?
    var albumArtist: String?
    var album: String?
    var trackNumber: Int?
    var discNumber: Int?
    var duration: Double = 0
    var artworkData: Data?
}

/// Reads tags with AVFoundation. ID3 (mp3), iTunes atoms (m4a/aac) and the common
/// key space are all consulted, because tagging varies a lot between files.
enum MetadataReader {
    private static let titleIDs: Set<AVMetadataIdentifier> = [
        .commonIdentifierTitle, .id3MetadataTitleDescription, .iTunesMetadataSongName,
    ]
    private static let artistIDs: Set<AVMetadataIdentifier> = [
        .commonIdentifierArtist, .id3MetadataLeadPerformer, .iTunesMetadataArtist,
    ]
    private static let albumIDs: Set<AVMetadataIdentifier> = [
        .commonIdentifierAlbumName, .id3MetadataAlbumTitle, .iTunesMetadataAlbum,
    ]
    private static let albumArtistIDs: Set<AVMetadataIdentifier> = [
        .id3MetadataBand, .iTunesMetadataAlbumArtist,
    ]
    private static let trackIDs: Set<AVMetadataIdentifier> = [
        .id3MetadataTrackNumber, .iTunesMetadataTrackNumber,
    ]
    private static let discIDs: Set<AVMetadataIdentifier> = [
        .id3MetadataPartOfASet, .iTunesMetadataDiscNumber,
    ]
    private static let artworkIDs: Set<AVMetadataIdentifier> = [
        .commonIdentifierArtwork, .id3MetadataAttachedPicture, .iTunesMetadataCoverArt,
    ]

    static func read(from url: URL) async -> ExtractedMetadata {
        let asset = AVURLAsset(url: url)
        var result = ExtractedMetadata()

        if let time = try? await asset.load(.duration), time.seconds.isFinite, time.seconds > 0 {
            result.duration = time.seconds
        }

        var items: [AVMetadataItem] = []
        if let all = try? await asset.load(.metadata) { items += all }
        if let common = try? await asset.load(.commonMetadata) { items += common }

        for item in items {
            guard let identifier = item.identifier else { continue }

            if result.title == nil, titleIDs.contains(identifier) {
                result.title = await string(item)
            } else if result.artist == nil, artistIDs.contains(identifier) {
                result.artist = await string(item)
            } else if result.album == nil, albumIDs.contains(identifier) {
                result.album = await string(item)
            } else if result.albumArtist == nil, albumArtistIDs.contains(identifier) {
                result.albumArtist = await string(item)
            } else if result.trackNumber == nil, trackIDs.contains(identifier) {
                result.trackNumber = await index(item)
            } else if result.discNumber == nil, discIDs.contains(identifier) {
                result.discNumber = await index(item)
            } else if result.artworkData == nil, artworkIDs.contains(identifier) {
                result.artworkData = try? await item.load(.dataValue)
            }
        }
        return result
    }

    private static func string(_ item: AVMetadataItem) async -> String? {
        guard let raw = try? await item.load(.stringValue) else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Handles "3", "3/12" (ID3 strings), plain numbers, and the iTunes 8-byte `trkn`/`disk` blobs.
    private static func index(_ item: AVMetadataItem) async -> Int? {
        if let text = try? await item.load(.stringValue),
           let first = text.split(separator: "/").first,
           let value = Int(first.trimmingCharacters(in: .whitespaces)), value > 0 {
            return value
        }
        if let number = try? await item.load(.numberValue), number.intValue > 0 {
            return number.intValue
        }
        if let data = try? await item.load(.dataValue), data.count >= 4 {
            let value = Int(data[data.startIndex + 2]) << 8 | Int(data[data.startIndex + 3])
            return value > 0 ? value : nil
        }
        return nil
    }
}
