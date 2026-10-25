import SwiftUI

extension View {
    /// Docks the mini player above the tab bar (apply to a tab's NavigationStack).
    func withMiniPlayer() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            MiniPlayer()
        }
    }
}

struct MiniPlayer: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let engine = app.engine
        if let track = engine.currentTrack {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    ArtworkView(file: track.artworkFile, seed: track.albumTitle, cornerRadius: 8, pixel: 120)
                        .frame(width: 44, height: 44)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text(track.artistName)
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 8)

                    Button {
                        engine.togglePlayPause()
                    } label: {
                        Image(systemName: engine.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title3)
                            .frame(width: 40, height: 40)
                            .contentTransition(.symbolEffect(.replace))
                    }
                    Button {
                        engine.next()
                    } label: {
                        Image(systemName: "forward.fill")
                            .font(.body)
                            .frame(width: 36, height: 40)
                    }
                    .disabled(engine.queue.nextIndex(repeatMode: engine.repeatMode == .one ? .all : engine.repeatMode) == nil)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)

                GeometryReader { proxy in
                    let fraction = engine.duration > 0 ? min(max(engine.currentTime / engine.duration, 0), 1) : 0
                    Rectangle()
                        .fill(Theme.accentGradient)
                        .frame(width: proxy.size.width * fraction, height: 2)
                }
                .frame(height: 2)
                .padding(.horizontal, 12)
                .padding(.bottom, 6)
            }
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.hairline))
            .padding(.horizontal, 10)
            .padding(.bottom, 6)
            .contentShape(Rectangle())
            .onTapGesture { app.showNowPlaying = true }
        }
    }
}
