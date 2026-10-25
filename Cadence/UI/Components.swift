import SwiftUI

// MARK: - Artwork

struct ArtworkView: View {
    @Environment(AppModel.self) private var app

    let file: String?
    let seed: String
    var cornerRadius: CGFloat = 12
    var pixel: CGFloat = 400

    @State private var loaded: UIImage?

    private var cached: UIImage? {
        guard let file else { return nil }
        return ArtworkCache.shared.image(for: ArtworkLoader.key(file: file, pixel: pixel))
    }

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let image = loaded ?? cached {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    PlaceholderArt(seed: seed)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .task(id: file) {
                guard let file else {
                    loaded = nil
                    return
                }
                let key = ArtworkLoader.key(file: file, pixel: pixel)
                let image = await ArtworkLoader.image(at: app.paths.artworkURL(file), key: key, maxPixel: pixel)
                loaded = image?.image
            }
    }
}

struct PlaceholderArt: View {
    let seed: String

    var body: some View {
        let hue = Double(Format.stableHash(seed) % 360) / 360
        LinearGradient(
            colors: [
                Color(hue: hue, saturation: 0.55, brightness: 0.60),
                Color(hue: (hue + 0.12).truncatingRemainder(dividingBy: 1), saturation: 0.70, brightness: 0.26),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay {
            GeometryReader { proxy in
                Image(systemName: "music.note")
                    .font(.system(size: proxy.size.width * 0.34, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.55))
                    .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
    }
}

// MARK: - Rows & cards

struct TrackRow: View {
    @Environment(AppModel.self) private var app

    let track: TrackItem
    var onTap: () -> Void

    var body: some View {
        let isCurrent = app.engine.currentTrack?.id == track.id
        Button(action: onTap) {
            HStack(spacing: 12) {
                ArtworkView(file: track.artworkFile, seed: track.albumTitle, cornerRadius: 8, pixel: 140)
                    .frame(width: 48, height: 48)

                VStack(alignment: .leading, spacing: 2) {
                    Text(track.title)
                        .font(.body.weight(.medium))
                        .foregroundStyle(isCurrent ? Theme.accent : Color.white)
                        .lineLimit(1)
                    Text("\(track.artistName) · \(track.albumTitle)")
                        .font(.footnote)
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if isCurrent {
                    Image(systemName: "waveform")
                        .foregroundStyle(Theme.accent)
                        .symbolEffect(.variableColor.iterative, isActive: app.engine.isPlaying)
                }
                Text(Format.time(track.duration))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(Theme.textSecondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .trackMenu(track)
    }
}

struct TrackCard: View {
    let track: TrackItem
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                ArtworkView(file: track.artworkFile, seed: track.albumTitle, cornerRadius: 14, pixel: 360)
                    .frame(width: 148, height: 148)
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
                .frame(width: 148, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .trackMenu(track)
    }
}

struct AlbumCard: View {
    let album: AlbumItem

    var body: some View {
        NavigationLink(value: album) {
            VStack(alignment: .leading, spacing: 8) {
                ArtworkView(file: album.artworkFile, seed: album.title, cornerRadius: 14, pixel: 360)
                    .frame(width: 148, height: 148)
                VStack(alignment: .leading, spacing: 2) {
                    Text(album.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(album.artistName)
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                }
                .frame(width: 148, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
    }
}

struct CollectionRow: View {
    let file: String?
    let seed: String
    let title: String
    let subtitle: String
    var round = false

    var body: some View {
        HStack(spacing: 12) {
            ArtworkView(file: file, seed: seed, cornerRadius: round ? 28 : 8, pixel: 140)
                .frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Small pieces

struct SectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.title3.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
    }
}

struct EmptyStateView: View {
    let symbol: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(Theme.accentGradient)
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.headline)
                        .foregroundStyle(Theme.background)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 12)
                        .background(Theme.accentGradient, in: Capsule())
                }
                .padding(.top, 6)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

struct PillButton: View {
    let title: String
    let symbol: String
    var filled = true
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(filled ? Theme.background : Color.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background {
                    if filled {
                        Capsule().fill(Theme.accentGradient)
                    } else {
                        Capsule().fill(Theme.surfaceRaised)
                    }
                }
        }
        .buttonStyle(.plain)
    }
}

struct ImportMenu: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Menu {
            Button {
                app.pickerMode = .files
            } label: {
                Label("Import Files", systemImage: "doc.badge.plus")
            }
            Button {
                app.pickerMode = .folder
            } label: {
                Label("Import Folder", systemImage: "folder.badge.plus")
            }
        } label: {
            Image(systemName: "plus.circle.fill")
                .font(.title3)
                .foregroundStyle(Theme.accent)
        }
    }
}

// MARK: - Track context menu

extension View {
    func trackMenu(_ track: TrackItem) -> some View {
        modifier(TrackMenu(track: track))
    }
}

struct TrackMenu: ViewModifier {
    @Environment(AppModel.self) private var app
    let track: TrackItem

    func body(content: Content) -> some View {
        content.contextMenu {
            Button {
                app.engine.playNext(track)
            } label: {
                Label("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward")
            }
            Button {
                app.engine.enqueue(track)
            } label: {
                Label("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward")
            }
            Menu {
                ForEach(app.library.playlists) { playlist in
                    Button(playlist.name) {
                        Task { await app.add(trackIDs: [track.id], to: playlist) }
                    }
                }
                Button {
                    app.newPlaylistRequest = NewPlaylistRequest(trackIDs: [track.id])
                } label: {
                    Label("New Playlist…", systemImage: "plus")
                }
            } label: {
                Label("Add to Playlist", systemImage: "music.note.list")
            }
            Divider()
            Button(role: .destructive) {
                app.pendingDelete = track
            } label: {
                Label("Delete from Library", systemImage: "trash")
            }
        }
    }
}

// MARK: - Navigation destinations

extension View {
    func libraryDestinations() -> some View {
        navigationDestination(for: AlbumItem.self) { AlbumDetailView(album: $0) }
            .navigationDestination(for: ArtistItem.self) { ArtistDetailView(artist: $0) }
            .navigationDestination(for: PlaylistItem.self) { PlaylistDetailView(playlist: $0) }
    }
}
