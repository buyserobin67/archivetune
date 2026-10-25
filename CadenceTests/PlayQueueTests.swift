import XCTest
@testable import Cadence

extension TrackItem {
    static func sample(_ id: Int64) -> TrackItem {
        TrackItem(
            id: id, title: "Track \(id)", artistId: 1, artistName: "Artist",
            albumId: 1, albumTitle: "Album", artworkFile: nil, trackNumber: Int(id), discNumber: nil,
            duration: 100, fileName: "\(id).mp3", playCount: 0, addedAt: Date(), lastPlayedAt: nil
        )
    }
}

final class PlayQueueTests: XCTestCase {
    private func queue(_ count: Int, startAt: Int = 0) -> PlayQueue {
        var queue = PlayQueue()
        queue.replace(with: (1...Int64(count)).map { TrackItem.sample($0) }, startAt: startAt)
        return queue
    }

    func testReplaceClampsStartIndex() {
        XCTAssertEqual(queue(3, startAt: 99).currentIndex, 2)
        XCTAssertEqual(queue(3, startAt: -4).currentIndex, 0)
        var empty = PlayQueue()
        empty.replace(with: [])
        XCTAssertNil(empty.currentIndex)
    }

    func testNextAndPreviousRespectRepeat() {
        let last = queue(3, startAt: 2)
        XCTAssertNil(last.nextIndex(repeatMode: .off))
        XCTAssertEqual(last.nextIndex(repeatMode: .all), 0)

        let first = queue(3, startAt: 0)
        XCTAssertNil(first.previousIndex(repeatMode: .off))
        XCTAssertEqual(first.previousIndex(repeatMode: .all), 2)
        XCTAssertEqual(first.nextIndex(repeatMode: .off), 1)
    }

    func testInsertNextAndAppend() {
        var q = queue(3, startAt: 1)
        q.insertNext(.sample(10))
        XCTAssertEqual(q.items.map(\.id), [1, 2, 10, 3])
        q.append(.sample(11))
        XCTAssertEqual(q.items.map(\.id), [1, 2, 10, 3, 11])
        XCTAssertEqual(q.current?.id, 2)
    }

    func testRemoveBeforeCurrentShiftsIndex() {
        var q = queue(4, startAt: 2)
        let removedCurrent = q.remove(atOffsets: IndexSet(integer: 0))
        XCTAssertFalse(removedCurrent)
        XCTAssertEqual(q.currentIndex, 1)
        XCTAssertEqual(q.current?.id, 3)
    }

    func testRemoveCurrentSelectsFollowingItem() {
        var q = queue(4, startAt: 1)
        XCTAssertTrue(q.remove(atOffsets: IndexSet(integer: 1)))
        XCTAssertEqual(q.current?.id, 3)
    }

    func testRemoveCurrentAtEndClamps() {
        var q = queue(3, startAt: 2)
        XCTAssertTrue(q.remove(atOffsets: IndexSet(integer: 2)))
        XCTAssertEqual(q.current?.id, 2)
    }

    func testRemoveEverythingClearsCurrent() {
        var q = queue(2)
        q.remove(atOffsets: IndexSet(0..<2))
        XCTAssertTrue(q.isEmpty)
        XCTAssertNil(q.currentIndex)
    }

    func testMoveMatchesSwiftUISemanticsAndTracksCurrent() {
        var q = queue(4, startAt: 0)
        q.move(fromOffsets: IndexSet(integer: 0), toOffset: 3)
        XCTAssertEqual(q.items.map(\.id), [2, 3, 1, 4])
        XCTAssertEqual(q.current?.id, 1)

        var down = queue(4, startAt: 3)
        down.move(fromOffsets: IndexSet(integer: 3), toOffset: 0)
        XCTAssertEqual(down.items.map(\.id), [4, 1, 2, 3])
        XCTAssertEqual(down.current?.id, 4)
    }

    func testRemoveTracksByID() {
        var q = queue(4, startAt: 1)
        XCTAssertTrue(q.removeTracks(withIDs: [2, 4]))
        XCTAssertEqual(q.items.map(\.id), [1, 3])
        XCTAssertEqual(q.current?.id, 3)
    }
}
