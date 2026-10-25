import AVFoundation
import MediaPlayer
import Observation

/// Milestone-1 engine: one `AVPlayer`, one item at a time. Deliberately simple —
/// gapless/crossfade/EQ come later behind this same public surface.
@MainActor @Observable
final class PlaybackEngine {
    private(set) var queue = PlayQueue()
    private(set) var isPlaying = false
    private(set) var currentTime: Double = 0
    private(set) var duration: Double = 0
    private(set) var repeatMode: RepeatMode = .off
    private(set) var errorMessage: String?

    var currentTrack: TrackItem? { queue.current }

    @ObservationIgnored private let repository: LibraryRepository
    @ObservationIgnored private let paths: AppPaths
    @ObservationIgnored private let nowPlaying: NowPlayingCenter
    @ObservationIgnored private let player = AVPlayer()
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var statusObservation: NSKeyValueObservation?
    @ObservationIgnored private var sessionObservers: [NSObjectProtocol] = []
    @ObservationIgnored private var countedPlay = false
    @ObservationIgnored private var lastPersistedTime: Double = 0
    @ObservationIgnored private var consecutiveFailures = 0
    @ObservationIgnored private var resumeAfterInterruption = false

    init(repository: LibraryRepository, paths: AppPaths) {
        self.repository = repository
        self.paths = paths
        self.nowPlaying = NowPlayingCenter(paths: paths)

        // Local files: never wait to "minimize stalling", just start.
        player.automaticallyWaitsToMinimizeStalling = false

        configureAudioSession()
        installTimeObserver()
        installSessionObservers()
        installRemoteCommands()
    }

    // MARK: - Restore

    func restore() async {
        guard queue.isEmpty else { return }
        guard let saved = try? await repository.loadPersistedQueue() else { return }
        guard queue.isEmpty else { return }

        queue.replace(with: saved.items, startAt: saved.index)
        repeatMode = saved.repeatMode
        var position = saved.position
        if let track = queue.current, track.duration > 0, position >= track.duration - 1 {
            position = 0
        }
        load(index: saved.index, autoplay: false, startAt: position)
    }

    // MARK: - Queue control

    func play(_ tracks: [TrackItem], startAt index: Int = 0, shuffled: Bool = false) {
        guard !tracks.isEmpty else { return }
        if shuffled {
            queue.replace(with: tracks.shuffled(), startAt: 0)
        } else {
            queue.replace(with: tracks, startAt: index)
        }
        persistQueue()
        load(index: queue.currentIndex ?? 0, autoplay: true)
    }

    func playNext(_ track: TrackItem) {
        if queue.isEmpty {
            play([track])
            return
        }
        queue.insertNext(track)
        persistQueue()
    }

    func enqueue(_ track: TrackItem) {
        if queue.isEmpty {
            play([track])
            return
        }
        queue.append(track)
        persistQueue()
    }

    func jump(to index: Int) {
        guard queue.items.indices.contains(index) else { return }
        load(index: index, autoplay: true)
    }

    func removeFromQueue(atOffsets offsets: IndexSet) {
        let removedCurrent = queue.remove(atOffsets: offsets)
        afterQueueRemoval(removedCurrent: removedCurrent)
    }

    func removeTracks(withIDs ids: Set<Int64>) {
        let removedCurrent = queue.removeTracks(withIDs: ids)
        afterQueueRemoval(removedCurrent: removedCurrent)
    }

    func moveInQueue(fromOffsets source: IndexSet, toOffset destination: Int) {
        queue.move(fromOffsets: source, toOffset: destination)
        persistQueue()
        persistState()
    }

    func cycleRepeatMode() {
        repeatMode = repeatMode.next
        persistState()
    }

    private func afterQueueRemoval(removedCurrent: Bool) {
        persistQueue()
        if queue.isEmpty {
            stop()
        } else if removedCurrent, let index = queue.currentIndex {
            load(index: index, autoplay: isPlaying)
        } else {
            persistState()
        }
    }

    // MARK: - Transport

    func play() {
        guard queue.current != nil else { return }
        if player.currentItem == nil, let index = queue.currentIndex {
            load(index: index, autoplay: true, startAt: currentTime)
            return
        }
        activateSession()
        player.play()
        isPlaying = true
        refreshNowPlaying()
    }

    func pause() {
        player.pause()
        isPlaying = false
        refreshNowPlaying()
        persistState()
    }

    func togglePlayPause() {
        isPlaying ? pause() : play()
    }

    func next() {
        // Manual skip with repeat-one should still move on.
        let mode: RepeatMode = repeatMode == .one ? .all : repeatMode
        guard let index = queue.nextIndex(repeatMode: mode) else { return }
        load(index: index, autoplay: true)
    }

    func previous() {
        let mode: RepeatMode = repeatMode == .one ? .all : repeatMode
        if currentTime > 3 || queue.previousIndex(repeatMode: mode) == nil {
            seek(to: 0)
        } else if let index = queue.previousIndex(repeatMode: mode) {
            load(index: index, autoplay: true)
        }
    }

    func seek(to seconds: Double) {
        let upper = duration > 0 ? duration : seconds
        let target = min(max(seconds, 0), upper)
        currentTime = target
        player.seek(
            to: CMTime(seconds: target, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        )
        refreshNowPlaying()
        persistState()
    }

    func persistNow() {
        persistState()
    }

    func clearError() {
        errorMessage = nil
    }

    // MARK: - Loading

    private func load(index: Int, autoplay: Bool, startAt: Double = 0) {
        guard queue.items.indices.contains(index) else {
            stop()
            return
        }
        queue.setCurrent(index)
        let track = queue.items[index]
        let url = paths.audioURL(track.fileName)

        guard FileManager.default.fileExists(atPath: url.path) else {
            skipUnplayable(track, autoplay: autoplay)
            return
        }

        removeItemObservers()
        let item = AVPlayerItem(url: url)
        observe(item)
        player.replaceCurrentItem(with: item)

        countedPlay = false
        lastPersistedTime = startAt
        currentTime = startAt
        duration = track.duration
        if startAt > 0 {
            player.seek(
                to: CMTime(seconds: startAt, preferredTimescale: 600),
                toleranceBefore: .zero,
                toleranceAfter: .zero
            )
        }

        if autoplay {
            activateSession()
            player.play()
            isPlaying = true
        } else {
            player.pause()
            isPlaying = false
        }
        refreshNowPlaying()
        persistState()
    }

    private func skipUnplayable(_ track: TrackItem, autoplay: Bool) {
        errorMessage = "Couldn't play “\(track.title)”."
        consecutiveFailures += 1
        let mode: RepeatMode = repeatMode == .one ? .all : repeatMode
        if consecutiveFailures < queue.items.count, let index = queue.nextIndex(repeatMode: mode) {
            load(index: index, autoplay: autoplay)
        } else {
            consecutiveFailures = 0
            player.pause()
            isPlaying = false
            refreshNowPlaying()
        }
    }

    private func stop() {
        removeItemObservers()
        player.pause()
        player.replaceCurrentItem(with: nil)
        isPlaying = false
        currentTime = 0
        duration = 0
        refreshNowPlaying()
        persistState()
    }

    private func trackDidFinish() {
        if repeatMode == .one {
            countedPlay = false
            seek(to: 0)
            player.play()
            isPlaying = true
            refreshNowPlaying()
        } else if let index = queue.nextIndex(repeatMode: repeatMode) {
            load(index: index, autoplay: true)
        } else {
            // End of queue: rewind the last track and wait.
            player.pause()
            isPlaying = false
            seek(to: 0)
        }
    }

    // MARK: - Observers

    private func observe(_ item: AVPlayerItem) {
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item,
            queue: .main
        ) { @Sendable [weak self] _ in
            MainActor.assumeIsolated { self?.trackDidFinish() }
        }
        statusObservation = item.observe(\.status, options: [.new]) { @Sendable [weak self] _, change in
            guard change.newValue == .failed else { return }
            Task { @MainActor in self?.currentItemFailed() }
        }
    }

    private func removeItemObservers() {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        statusObservation?.invalidate()
        statusObservation = nil
    }

    private func currentItemFailed() {
        guard let track = queue.current else { return }
        skipUnplayable(track, autoplay: isPlaying)
    }

    private func installTimeObserver() {
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) {
            @Sendable [weak self] time in
            let seconds = time.seconds
            MainActor.assumeIsolated { self?.timeTick(seconds) }
        }
    }

    private func timeTick(_ seconds: Double) {
        guard seconds.isFinite, let item = player.currentItem, let track = queue.current else { return }
        currentTime = seconds
        consecutiveFailures = 0

        if duration <= 0, item.duration.seconds.isFinite, item.duration.seconds > 0 {
            duration = item.duration.seconds
            refreshNowPlaying()
        }
        if !countedPlay, seconds >= min(30, max(duration / 2, 5)) {
            countedPlay = true
            repository.recordPlay(trackID: track.id)
        }
        if isPlaying, abs(seconds - lastPersistedTime) >= 5 {
            lastPersistedTime = seconds
            persistState()
        }
    }

    // MARK: - Audio session & remote commands

    private func configureAudioSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
    }

    private func activateSession() {
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    private func installSessionObservers() {
        let center = NotificationCenter.default

        sessionObservers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { @Sendable [weak self] note in
            let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let options = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt
            MainActor.assumeIsolated { self?.handleInterruption(type: type, options: options) }
        })

        sessionObservers.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { @Sendable [weak self] note in
            let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            MainActor.assumeIsolated { self?.handleRouteChange(reason: reason) }
        })
    }

    private func handleInterruption(type: UInt?, options: UInt?) {
        guard let type, let kind = AVAudioSession.InterruptionType(rawValue: type) else { return }
        switch kind {
        case .began:
            resumeAfterInterruption = isPlaying
            isPlaying = false
            refreshNowPlaying()
        case .ended:
            let flags = AVAudioSession.InterruptionOptions(rawValue: options ?? 0)
            if flags.contains(.shouldResume), resumeAfterInterruption {
                play()
            }
            resumeAfterInterruption = false
        @unknown default:
            break
        }
    }

    private func handleRouteChange(reason: UInt?) {
        guard let reason,
              AVAudioSession.RouteChangeReason(rawValue: reason) == .oldDeviceUnavailable,
              isPlaying else { return }
        // Headphones unplugged / Bluetooth disconnected: stop rather than blast the speaker.
        pause()
    }

    private func installRemoteCommands() {
        let commands = MPRemoteCommandCenter.shared()

        commands.playCommand.addTarget { @Sendable [weak self] _ in
            Task { @MainActor in self?.play() }
            return .success
        }
        commands.pauseCommand.addTarget { @Sendable [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }
        commands.togglePlayPauseCommand.addTarget { @Sendable [weak self] _ in
            Task { @MainActor in self?.togglePlayPause() }
            return .success
        }
        commands.nextTrackCommand.addTarget { @Sendable [weak self] _ in
            Task { @MainActor in self?.next() }
            return .success
        }
        commands.previousTrackCommand.addTarget { @Sendable [weak self] _ in
            Task { @MainActor in self?.previous() }
            return .success
        }
        commands.changePlaybackPositionCommand.addTarget { @Sendable [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            let position = event.positionTime
            Task { @MainActor in self?.seek(to: position) }
            return .success
        }
    }

    // MARK: - Persistence & Now Playing

    private func persistQueue() {
        repository.saveQueue(trackIDs: queue.items.map(\.id))
    }

    private func persistState() {
        guard !queue.isEmpty else { return }
        repository.savePlaybackState(index: queue.currentIndex, position: currentTime, repeatMode: repeatMode)
    }

    private func refreshNowPlaying() {
        nowPlaying.update(track: queue.current, elapsed: currentTime, duration: duration, isPlaying: isPlaying)
    }
}
