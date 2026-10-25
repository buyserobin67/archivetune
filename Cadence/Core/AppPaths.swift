import Foundation

/// Where Cadence keeps its files. The database stores file *names* only, so the
/// library survives the app container path changing between launches/installs.
struct AppPaths: Sendable {
    let root: URL

    var audioDirectory: URL { root.appendingPathComponent("Audio", isDirectory: true) }
    var artworkDirectory: URL { root.appendingPathComponent("Artwork", isDirectory: true) }
    var databaseURL: URL { root.appendingPathComponent("cadence.sqlite") }

    init(root: URL) {
        self.root = root
    }

    static func standard() throws -> AppPaths {
        let base = URL.applicationSupportDirectory.appendingPathComponent("Cadence", isDirectory: true)
        let paths = AppPaths(root: base)
        try paths.createDirectories()
        return paths
    }

    func createDirectories() throws {
        let fileManager = FileManager.default
        for directory in [root, audioDirectory, artworkDirectory] {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        }
    }

    func audioURL(_ fileName: String) -> URL {
        audioDirectory.appendingPathComponent(fileName)
    }

    func artworkURL(_ fileName: String) -> URL {
        artworkDirectory.appendingPathComponent(fileName)
    }
}
