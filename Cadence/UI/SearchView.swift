import SwiftUI

struct SearchView: View {
    @Environment(AppModel.self) private var app
    @State private var query = ""
    @State private var results = SearchResults.empty

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Group {
                if trimmedQuery.isEmpty {
                    EmptyStateView(
                        symbol: "magnifyingglass",
                        title: "Search your library",
                        message: "Find songs, albums and artists. Everything is searched on this device."
                    )
                    .frame(maxHeight: .infinity)
                } else if results.isEmpty {
                    EmptyStateView(
                        symbol: "questionmark.circle",
                        title: "No results",
                        message: "Nothing matches “\(trimmedQuery)”."
                    )
                    .frame(maxHeight: .infinity)
                } else {
                    resultsList
                }
            }
            .background(Theme.background)
            .navigationTitle("Search")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Songs, albums, artists")
            .libraryDestinations()
            .task(id: query) {
                guard !trimmedQuery.isEmpty else {
                    results = .empty
                    return
                }
                try? await Task.sleep(for: .milliseconds(200))
                guard !Task.isCancelled else { return }
                results = await app.library.search(trimmedQuery)
            }
        }
        .withMiniPlayer()
    }

    private var resultsList: some View {
        List {
            if !results.tracks.isEmpty {
                Section {
                    ForEach(Array(results.tracks.enumerated()), id: \.element.id) { index, track in
                        TrackRow(track: track) { app.engine.play(results.tracks, startAt: index) }
                            .listRowBackground(Color.clear)
                            .listRowSeparatorTint(Theme.hairline)
                    }
                } header: {
                    Text("Songs").font(.title3.weight(.bold)).foregroundStyle(.white)
                }
            }
            if !results.albums.isEmpty {
                Section {
                    ForEach(results.albums) { album in
                        NavigationLink(value: album) {
                            CollectionRow(
                                file: album.artworkFile,
                                seed: album.title,
                                title: album.title,
                                subtitle: album.artistName
                            )
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(Theme.hairline)
                    }
                } header: {
                    Text("Albums").font(.title3.weight(.bold)).foregroundStyle(.white)
                }
            }
            if !results.artists.isEmpty {
                Section {
                    ForEach(results.artists) { artist in
                        NavigationLink(value: artist) {
                            CollectionRow(
                                file: artist.artworkFile,
                                seed: artist.name,
                                title: artist.name,
                                subtitle: Format.trackCount(artist.trackCount),
                                round: true
                            )
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(Theme.hairline)
                    }
                } header: {
                    Text("Artists").font(.title3.weight(.bold)).foregroundStyle(.white)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
    }
}
