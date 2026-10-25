import SwiftUI

struct NowPlayingView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var isScrubbing = false
    @State private var scrubValue = 0.0
    @State private var showQueue = false

    var body: some View {
        let engine = app.engine
        ZStack {
            backdrop(engine)

            VStack(spacing: 22) {
                topBar
                Spacer(minLength: 0)
                artwork(engine)
                Spacer(minLength: 0)
                titleBlock(engine)
                scrubber(engine)
                controls(engine)
            }
            .padding(.horizontal, 28)
            .padding(.top, 14)
            .padding(.bottom, 20)
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showQueue) {
            QueueView()
        }
    }

    // MARK: - Pieces

    private func backdrop(_ engine: PlaybackEngine) -> some View {
        ZStack {
            Theme.background
            if let track = engine.currentTrack {
                ArtworkView(file: track.artworkFile, seed: track.albumTitle, cornerRadius: 0, pixel: 200)
                    .scaleEffect(2.4)
                    .blur(radius: 70)
                    .opacity(0.55)
            }
            LinearGradient(
                colors: [.clear, Theme.background.opacity(0.92)],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .ignoresSafeArea()
        .clipped()
    }

    private var topBar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.title3.weight(.semibold))
                    .frame(width: 44, height: 44)
            }
            Spacer()
            Text("Now Playing")
                .font(.footnote.weight(.semibold))
                .textCase(.uppercase)
                .tracking(1.2)
                .foregroundStyle(Theme.textSecondary)
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .foregroundStyle(.white)
    }

    private func artwork(_ engine: PlaybackEngine) -> some View {
        ArtworkView(
            file: engine.currentTrack?.artworkFile,
            seed: engine.currentTrack?.albumTitle ?? "Cadence",
            cornerRadius: 22,
            pixel: 900
        )
        .shadow(color: .black.opacity(0.55), radius: 30, y: 18)
        .scaleEffect(engine.isPlaying ? 1 : 0.88)
        .animation(.spring(response: 0.45, dampingFraction: 0.72), value: engine.isPlaying)
    }

    private func titleBlock(_ engine: PlaybackEngine) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(engine.currentTrack?.title ?? "Nothing playing")
                .font(.title2.weight(.bold))
                .foregroundStyle(.white)
                .lineLimit(1)
            Text(engine.currentTrack.map { "\($0.artistName) — \($0.albumTitle)" } ?? " ")
                .font(.body)
                .foregroundStyle(Theme.textSecondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func scrubber(_ engine: PlaybackEngine) -> some View {
        let upper = max(engine.duration, 1)
        return VStack(spacing: 4) {
            Slider(
                value: Binding(
                    get: { isScrubbing ? scrubValue : min(engine.currentTime, upper) },
                    set: { scrubValue = $0 }
                ),
                in: 0...upper,
                onEditingChanged: { editing in
                    if editing {
                        scrubValue = engine.currentTime
                    } else {
                        engine.seek(to: scrubValue)
                    }
                    isScrubbing = editing
                }
            )
            .tint(Theme.accent)

            HStack {
                Text(Format.time(isScrubbing ? scrubValue : engine.currentTime))
                Spacer()
                Text("-" + Format.time(max(engine.duration - (isScrubbing ? scrubValue : engine.currentTime), 0)))
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(Theme.textSecondary)
        }
    }

    private func controls(_ engine: PlaybackEngine) -> some View {
        HStack {
            Button {
                engine.cycleRepeatMode()
            } label: {
                Image(systemName: engine.repeatMode == .one ? "repeat.1" : "repeat")
                    .font(.title3)
                    .foregroundStyle(engine.repeatMode == .off ? Theme.textSecondary : Theme.accent)
                    .frame(width: 44, height: 44)
            }
            Spacer()
            Button {
                engine.previous()
            } label: {
                Image(systemName: "backward.fill")
                    .font(.title)
                    .frame(width: 56, height: 56)
            }
            Spacer()
            Button {
                engine.togglePlayPause()
            } label: {
                Image(systemName: engine.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Theme.background)
                    .frame(width: 74, height: 74)
                    .background(Theme.accentGradient, in: Circle())
                    .contentTransition(.symbolEffect(.replace))
            }
            Spacer()
            Button {
                engine.next()
            } label: {
                Image(systemName: "forward.fill")
                    .font(.title)
                    .frame(width: 56, height: 56)
            }
            Spacer()
            Button {
                showQueue = true
            } label: {
                Image(systemName: "list.bullet")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
        }
        .foregroundStyle(.white)
        .disabled(engine.currentTrack == nil)
    }
}

// MARK: - Queue

struct QueueView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let engine = app.engine
        NavigationStack {
            Group {
                if engine.queue.isEmpty {
                    EmptyStateView(
                        symbol: "list.bullet",
                        title: "Queue is empty",
                        message: "Play a song or long-press one and choose Add to Queue."
                    )
                } else {
                    List {
                        ForEach(Array(engine.queue.items.enumerated()), id: \.offset) { index, track in
                            queueRow(engine, index: index, track: track)
                                .listRowBackground(
                                    index == engine.queue.currentIndex ? Theme.accent.opacity(0.14) : Color.clear
                                )
                                .listRowSeparatorTint(Theme.hairline)
                        }
                        .onMove { engine.moveInQueue(fromOffsets: $0, toOffset: $1) }
                        .onDelete { engine.removeFromQueue(atOffsets: $0) }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Theme.background)
            .navigationTitle("Queue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    EditButton().disabled(engine.queue.isEmpty)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func queueRow(_ engine: PlaybackEngine, index: Int, track: TrackItem) -> some View {
        let isCurrent = index == engine.queue.currentIndex
        return Button {
            engine.jump(to: index)
        } label: {
            HStack(spacing: 12) {
                ArtworkView(file: track.artworkFile, seed: track.albumTitle, cornerRadius: 8, pixel: 120)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(track.title)
                        .font(.body.weight(.medium))
                        .foregroundStyle(isCurrent ? Theme.accent : Color.white)
                        .lineLimit(1)
                    Text(track.artistName)
                        .font(.footnote)
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                }
                Spacer()
                Text(Format.time(track.duration))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(Theme.textSecondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
