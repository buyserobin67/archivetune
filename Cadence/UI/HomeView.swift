import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var app

    private var greeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<12: "Good morning"
        case 12..<18: "Good afternoon"
        default: "Good evening"
        }
    }

    var body: some View {
        let library = app.library
        NavigationStack {
            ScrollView {
                if library.tracks.isEmpty {
                    if library.hasLoaded {
                        EmptyStateView(
                            symbol: "waveform.circle.fill",
                            title: "Your library is empty",
                            message: "Import audio files from the Files app. They're copied into Cadence and play offline.",
                            actionTitle: "Import Music",
                            action: { app.pickerMode = .files }
                        )
                        .padding(.top, 80)
                    }
                } else {
                    LazyVStack(alignment: .leading, spacing: 30) {
                        hero(library)

                        if !library.recentlyPlayed.isEmpty {
                            trackShelf("Jump back in", tracks: library.recentlyPlayed)
                        }
                        if !library.recentTracks.isEmpty {
                            trackShelf("Recently added", tracks: library.recentTracks)
                        }
                        if !library.mostPlayed.isEmpty {
                            trackShelf("Most played", tracks: library.mostPlayed)
                        }
                        if !library.albums.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeader(title: "Albums")
                                ScrollView(.horizontal, showsIndicators: false) {
                                    LazyHStack(spacing: 14) {
                                        ForEach(library.albums.prefix(20)) { album in
                                            AlbumCard(album: album)
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
            .background(Theme.background)
            .navigationTitle(greeting)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { ImportMenu() }
            }
            .libraryDestinations()
        }
        .withMiniPlayer()
    }

    private func hero(_ library: LibraryStore) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("\(Format.trackCount(library.tracks.count)) · \(library.albums.count) albums")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
            HStack(spacing: 10) {
                PillButton(title: "Shuffle All", symbol: "shuffle") {
                    app.engine.play(library.tracks, shuffled: true)
                }
                PillButton(title: "Play All", symbol: "play.fill", filled: false) {
                    app.engine.play(library.tracks)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Theme.accent.opacity(0.28), Theme.accentAlt.opacity(0.10)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.hairline))
        .padding(.horizontal, 20)
    }

    private func trackShelf(_ title: String, tracks: [TrackItem]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: title)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 14) {
                    ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                        TrackCard(track: track) {
                            app.engine.play(tracks, startAt: index)
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }
}
