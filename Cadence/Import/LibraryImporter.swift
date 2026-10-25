import CryptoKit
import Foundation

/// Copies picked audio files into the app sandbox, reads their tags, and records them.
/// Files are copied (not referenced) so playback never depends on security-scoped
/// access or on the source still existing.
actor LibraryImporter {
    static let supportedExtensions: Set<String> = [
        "mp3", "m4a", "m4b", "aac", "wav", "aif", "aiff", "caf", "flac",
    ]

    private enum Outcome {
        case added, duplicate, failed
    }

    private let repository: LibraryRepository
    private let paths: AppPaths

    init(repository: LibraryRepository, paths: AppPaths) {
        self.repository = repository
        self.paths = paths
    }

    func importItems(
        at urls: [URL],
        progress: @MainActor @Sendable (ImportProgress) -> Void
    ) async -> ImportSummary {
        var summary = ImportSummary()
        var accessed: [URL] = []
        defer {
            for url in accessed { url.stopAccessingSecurityScopedResource() }
        }

        var files: [URL] = []
        for url in urls {
            if url.startAccessingSecurityScopedResource() { accessed.append(url) }
            if Self.isDirectory(url) {
                files += Self.audioFiles(inDirectory: url)
            } else if Self.isSupported(url) {
                files.append(url)
            } else {
                summary.unsupported += 1
            }
        }

        await progress(ImportProgress(done: 0, total: files.count))
        for (offset, file) in files.enumerated() {
            if Task.isCancelled { break }
            switch await importFile(file) {
            case .added: summary.added += 1
            case .duplicate: summary.duplicates += 1
            case .failed: summary.failed += 1
            }
            await progress(ImportProgress(done: offset + 1, total: files.count))
        }
        return summary
    }

    private func importFile(_ source: URL) async -> Outcome {
        let fileName = UUID().uuidString + "." + source.pathExtension.lowercased()
        let destination = paths.audioURL(fileName)
        let fileManager = FileManager.default

        do {
            let hash = try await Task.detached(priority: .utility) { () -> String in
                try Self.coordinatedCopy(from: source, to: destination)
                return try Self.sha256(of: destination)
            }.value

            if try await repository.trackExists(hash: hash) {
                try? fileManager.removeItem(at: destination)
                return .duplicate
            }

            let meta = await MetadataReader.read(from: destination)
            let artist = meta.artist ?? meta.albumArtist ?? "Unknown Artist"
            let attributes = try? fileManager.attributesOfItem(atPath: destination.path)
            let imported = ImportedTrack(
                title: meta.title ?? source.deletingPathExtension().lastPathComponent,
                artist: artist,
                albumArtist: meta.albumArtist ?? artist,
                album: meta.album ?? "Unknown Album",
                trackNumber: meta.trackNumber,
                discNumber: meta.discNumber,
                duration: meta.duration,
                fileName: fileName,
                contentHash: hash,
                fileSize: (attributes?[.size] as? Int) ?? 0,
                artworkFile: meta.artworkData.flatMap { saveArtwork($0) }
            )
            try await repository.insert(imported)
            return .added
        } catch {
            try? fileManager.removeItem(at: destination)
            return .failed
        }
    }

    private func saveArtwork(_ data: Data) -> String? {
        let name = Self.shortHash(of: data) + ".jpg"
        let url = paths.artworkURL(name)
        if FileManager.default.fileExists(atPath: url.path) { return name }
        guard let jpeg = ImageTools.jpegData(from: data, maxPixel: 1200) else { return nil }
        do {
            try jpeg.write(to: url, options: .atomic)
            return name
        } catch {
            return nil
        }
    }

    // MARK: - File helpers

    private static func isDirectory(_ url: URL) -> Bool {
        (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true
    }

    private static func isSupported(_ url: URL) -> Bool {
        supportedExtensions.contains(url.pathExtension.lowercased())
    }

    // Kept synchronous: NSEnumerator iteration is unavailable from async contexts.
    private static func audioFiles(inDirectory directory: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else { return [] }

        var found: [URL] = []
        for case let url as URL in enumerator where isSupported(url) {
            found.append(url)
        }
        return found.sorted { $0.path < $1.path }
    }

    /// Reads through NSFileCoordinator so iCloud Drive files get downloaded first.
    private static func coordinatedCopy(from source: URL, to destination: URL) throws {
        var coordinationError: NSError?
        var copyError: Error?
        NSFileCoordinator(filePresenter: nil).coordinate(
            readingItemAt: source, options: [], error: &coordinationError
        ) { readableURL in
            do {
                try FileManager.default.copyItem(at: readableURL, to: destination)
            } catch {
                copyError = error
            }
        }
        if let coordinationError { throw coordinationError }
        if let copyError { throw copyError }
    }

    private static func sha256(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func shortHash(of data: Data) -> String {
        SHA256.hash(data: data).prefix(10).map { String(format: "%02x", $0) }.joined()
    }
}
