import MediaPlayer
import UIKit

/// Publishes lock-screen / Control Center metadata.
@MainActor
final class NowPlayingCenter {
    private let paths: AppPaths
    private var loadedArtworkFile: String?
    private var artwork: MPMediaItemArtwork?

    init(paths: AppPaths) {
        self.paths = paths
    }

    func update(track: TrackItem?, elapsed: Double, duration: Double, isPlaying: Bool) {
        let center = MPNowPlayingInfoCenter.default()
        guard let track else {
            center.nowPlayingInfo = nil
            center.playbackState = .stopped
            return
        }

        if track.artworkFile != loadedArtworkFile {
            loadedArtworkFile = track.artworkFile
            artwork = nil
            if let file = track.artworkFile { loadArtwork(file: file) }
        }

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artistName,
            MPMediaItemPropertyAlbumTitle: track.albumTitle,
            MPMediaItemPropertyPlaybackDuration: max(duration, 0),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: max(elapsed, 0),
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
        ]
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        center.nowPlayingInfo = info
        center.playbackState = isPlaying ? .playing : .paused
    }

    private func loadArtwork(file: String) {
        let url = paths.artworkURL(file)
        let key = ArtworkLoader.key(file: file, pixel: 600)
        Task { [weak self] in
            guard let loaded = await ArtworkLoader.image(at: url, key: key, maxPixel: 600) else { return }
            guard let self, self.loadedArtworkFile == file else { return }
            let artwork = Self.makeArtwork(loaded)
            self.artwork = artwork
            let center = MPNowPlayingInfoCenter.default()
            if var info = center.nowPlayingInfo {
                info[MPMediaItemPropertyArtwork] = artwork
                center.nowPlayingInfo = info
            }
        }
    }

    // Must be nonisolated: MediaPlayer invokes the request handler on a background queue,
    // and a closure formed in a @MainActor context would trap on the isolation check.
    private nonisolated static func makeArtwork(_ loaded: LoadedImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: loaded.image.size) { @Sendable _ in loaded.image }
    }
}
