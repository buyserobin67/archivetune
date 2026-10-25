import Foundation

/// Pure value-type queue. All index bookkeeping lives here so it can be unit tested
/// without touching AVFoundation.
struct PlayQueue: Equatable, Sendable {
    private(set) var items: [TrackItem] = []
    private(set) var currentIndex: Int?

    var current: TrackItem? {
        guard let currentIndex, items.indices.contains(currentIndex) else { return nil }
        return items[currentIndex]
    }

    var isEmpty: Bool { items.isEmpty }

    mutating func replace(with newItems: [TrackItem], startAt index: Int = 0) {
        items = newItems
        currentIndex = newItems.isEmpty ? nil : min(max(index, 0), newItems.count - 1)
    }

    mutating func setCurrent(_ index: Int?) {
        guard let index, items.indices.contains(index) else {
            currentIndex = nil
            return
        }
        currentIndex = index
    }

    mutating func append(_ track: TrackItem) {
        items.append(track)
        if currentIndex == nil { currentIndex = 0 }
    }

    mutating func insertNext(_ track: TrackItem) {
        guard let currentIndex else {
            append(track)
            return
        }
        items.insert(track, at: currentIndex + 1)
    }

    /// Returns true when the currently playing item was removed. `currentIndex` then
    /// points at the item that slid into its place (clamped to the end).
    @discardableResult
    mutating func remove(atOffsets offsets: IndexSet) -> Bool {
        let valid = offsets.filter { items.indices.contains($0) }
        guard !valid.isEmpty else { return false }

        let removedCurrent = currentIndex.map { valid.contains($0) } ?? false
        if let currentIndex {
            let before = valid.reduce(0) { $0 + ($1 < currentIndex ? 1 : 0) }
            self.currentIndex = currentIndex - before
        }
        for index in valid.sorted(by: >) {
            items.remove(at: index)
        }
        if items.isEmpty {
            currentIndex = nil
        } else if let index = currentIndex, index >= items.count {
            currentIndex = items.count - 1
        }
        return removedCurrent
    }

    @discardableResult
    mutating func removeTracks(withIDs ids: Set<Int64>) -> Bool {
        var offsets = IndexSet()
        for (index, track) in items.enumerated() where ids.contains(track.id) {
            offsets.insert(index)
        }
        return remove(atOffsets: offsets)
    }

    /// Same semantics as SwiftUI's `move(fromOffsets:toOffset:)`.
    mutating func move(fromOffsets source: IndexSet, toOffset destination: Int) {
        let moving = source.filter { items.indices.contains($0) }.sorted()
        guard !moving.isEmpty else { return }

        let adjusted = destination - moving.reduce(0) { $0 + ($1 < destination ? 1 : 0) }
        var order = Array(items.indices)
        let moved = moving.map { order[$0] }
        for index in moving.sorted(by: >) {
            order.remove(at: index)
        }
        order.insert(contentsOf: moved, at: min(max(adjusted, 0), order.count))

        let oldCurrent = currentIndex
        items = order.map { items[$0] }
        if let oldCurrent {
            currentIndex = order.firstIndex(of: oldCurrent)
        }
    }

    mutating func clear() {
        items = []
        currentIndex = nil
    }

    func nextIndex(repeatMode: RepeatMode) -> Int? {
        guard let currentIndex, !items.isEmpty else { return nil }
        if currentIndex + 1 < items.count { return currentIndex + 1 }
        return repeatMode == .all ? 0 : nil
    }

    func previousIndex(repeatMode: RepeatMode) -> Int? {
        guard let currentIndex, !items.isEmpty else { return nil }
        if currentIndex > 0 { return currentIndex - 1 }
        return repeatMode == .all ? items.count - 1 : nil
    }
}
