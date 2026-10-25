import SwiftUI

private enum LibrarySection: String, CaseIterable, Identifiable {
    case songs = "Songs"
    case albums = "Albums"
    case artists = "Artists"
    case playlists = "Playlists"

    var id: String { rawValue }
}

struct LibraryView: View {
    @Environment(AppModel.self) private var app
    @State private var section: LibrarySection = .songs

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Section", selection: $section) {
                    ForEach(LibrarySection.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 20)
                .padding(.bottom, 8)

                switch section {
                case .songs: SongsList()
                case .albums: AlbumsList()
                case .artists: ArtistsList()
                case .playlists: PlaylistsList()
                }
            }
            .background(Theme.background)
            .navigationTitle("Library")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if section == .playlists {
                        Button {
                            app.newPlaylistRequest = NewPlaylistRequest(trackIDs: [])
                        } label: {
                            Image(systemName: "text.badge.plus")
                                .foregroundStyle(Theme.accent)
                        }
                    } else {
                        ImportMenu()
                    }
                }
            }
            .libraryDestinations()
        }
        .withMiniPlayer()
    }
}

// MARK: - Shared list styling

private extension View {
    func cadenceList() -> some View {
        listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
    }

    func cadenceRow() -> some View {
        listRowBackground(Color.clear)
            .listRowSeparatorTint(Theme.hairline)
    }
}

// MARK: - Sections

private struct SongsList: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let tracks = app.library.tracks
        if tracks.isEmpty {
            EmptyStateView(
                symbol: "music.note",
                title: "No songs yet",
                message: "Import files from the Files app to build your offline library.",
                actionTitle: "Import Music",
                action: { app.pickerMode = .files }
            )
            .frame(maxHeight: .infinity)
        } else {
            List {
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    TrackRow(track: track) { app.engine.play(tracks, startAt: index) }
                        .cadenceRow()
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                app.pendingDelete = track
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
            .cadenceList()
        }
    }
}

private struct AlbumsList: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let albums = app.library.albums
        if albums.isEmpty {
            EmptyStateView(symbol: "square.stack", title: "No albums", message: "Albums appear once you import songs.")
                .frame(maxHeight: .infinity)
        } else {
            List {
                ForEach(albums) { album in
                    NavigationLink(value: album) {
                        CollectionRow(
                            file: album.artworkFile,
                            seed: album.title,
                            title: album.title,
                            subtitle: "\(album.artistName) · \(Format.trackCount(album.trackCount))"
                        )
                    }
                    .cadenceRow()
                }
            }
            .cadenceList()
        }
    }
}

private struct ArtistsList: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let artists = app.library.artists
        if artists.isEmpty {
            EmptyStateView(symbol: "music.mic", title: "No artists", message: "Artists appear once you import songs.")
                .frame(maxHeight: .infinity)
        } else {
            List {
                ForEach(artists) { artist in
                    NavigationLink(value: artist) {
                        CollectionRow(
                            file: artist.artworkFile,
                            seed: artist.name,
                            title: artist.name,
                            subtitle: "\(artist.albumCount) \(artist.albumCount == 1 ? "album" : "albums") · \(Format.trackCount(artist.trackCount))",
                            round: true
                        )
                    }
                    .cadenceRow()
                }
            }
            .cadenceList()
        }
    }
}

private struct PlaylistsList: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let playlists = app.library.playlists
        if playlists.isEmpty {
            EmptyStateView(
                symbol: "music.note.list",
                title: "No playlists",
                message: "Create a playlist, or long-press any song to add it to one.",
                actionTitle: "New Playlist",
                action: { app.newPlaylistRequest = NewPlaylistRequest(trackIDs: []) }
            )
            .frame(maxHeight: .infinity)
        } else {
            List {
                ForEach(playlists) { playlist in
                    NavigationLink(value: playlist) {
                        CollectionRow(
                            file: playlist.artworkFile,
                            seed: playlist.name,
                            title: playlist.name,
                            subtitle: Format.trackCount(playlist.trackCount)
                        )
                    }
                    .cadenceRow()
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await app.deletePlaylist(playlist) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            .cadenceList()
        }
    }
}

// MARK: - Detail screens

struct DetailHeader: View {
    let file: String?
    let seed: String
    let title: String
    let subtitle: String
    let tracks: [TrackItem]
    var round = false

    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(spacing: 14) {
            ArtworkView(file: file, seed: seed, cornerRadius: round ? 100 : 18, pixel: 600)
                .frame(width: 200, height: 200)
                .shadow(color: .black.opacity(0.5), radius: 18, y: 10)
            VStack(spacing: 4) {
                Text(title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
            }
            HStack(spacing: 10) {
                PillButton(title: "Play", symbol: "play.fill") {
                    app.engine.play(tracks)
                }
                PillButton(title: "Shuffle", symbol: "shuffle", filled: false) {
                    app.engine.play(tracks, shuffled: true)
                }
            }
            .disabled(tracks.isEmpty)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }
}

private func orderedForAlbum(_ tracks: [TrackItem]) -> [TrackItem] {
    tracks.sorted {
        let leftDisc = $0.discNumber ?? 1
        let rightDisc = $1.discNumber ?? 1
        if leftDisc != rightDisc { return leftDisc < rightDisc }
        let leftTrack = $0.trackNumber ?? Int.max
        let rightTrack = $1.trackNumber ?? Int.max
        if leftTrack != rightTrack { return leftTrack < rightTrack }
        return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
    }
}

struct AlbumDetailView: View {
    @Environment(AppModel.self) private var app
    let album: AlbumItem

    var body: some View {
        let tracks = orderedForAlbum(app.library.tracks.filter { $0.albumId == album.id })
        List {
            DetailHeader(
                file: album.artworkFile,
                seed: album.title,
                title: album.title,
                subtitle: "\(album.artistName) · \(Format.trackCount(tracks.count))",
                tracks: tracks
            )
            ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                TrackRow(track: track) { app.engine.play(tracks, startAt: index) }
                    .cadenceRow()
            }
        }
        .cadenceList()
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ArtistDetailView: View {
    @Environment(AppModel.self) private var app
    let artist: ArtistItem

    var body: some View {
        let tracks = app.library.tracks.filter { $0.artistId == artist.id }
        let albumIDs = Set(tracks.map(\.albumId))
        let albums = app.library.albums.filter { albumIDs.contains($0.id) }

        List {
            DetailHeader(
                file: artist.artworkFile,
                seed: artist.name,
                title: artist.name,
                subtitle: Format.trackCount(tracks.count),
                tracks: tracks,
                round: true
            )
            if !albums.isEmpty {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(spacing: 14) {
                            ForEach(albums) { AlbumCard(album: $0) }
                        }
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 8, trailing: 20))
                } header: {
                    Text("Albums").font(.title3.weight(.bold)).foregroundStyle(.white)
                }
            }
            Section {
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    TrackRow(track: track) { app.engine.play(tracks, startAt: index) }
                        .cadenceRow()
                }
            } header: {
                Text("Songs").font(.title3.weight(.bold)).foregroundStyle(.white)
            }
        }
        .cadenceList()
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct PlaylistDetailView: View {
    @Environment(AppModel.self) private var app
    let playlist: PlaylistItem
    @State private var tracks: [TrackItem] = []

    var body: some View {
        List {
            DetailHeader(
                file: playlist.artworkFile,
                seed: playlist.name,
                title: playlist.name,
                subtitle: Format.trackCount(tracks.count),
                tracks: tracks
            )
            if tracks.isEmpty {
                Text("Long-press a song anywhere in Cadence and choose Add to Playlist.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                TrackRow(track: track) { app.engine.play(tracks, startAt: index) }
                    .cadenceRow()
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await app.remove(trackID: track.id, from: playlist) }
                        } label: {
                            Label("Remove", systemImage: "minus.circle")
                        }
                    }
            }
        }
        .cadenceList()
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                for try await items in app.library.observePlaylistTracks(id: playlist.id) {
                    tracks = items
                }
            } catch {
                // Observation cancelled when the view disappears.
            }
        }
    }
}
