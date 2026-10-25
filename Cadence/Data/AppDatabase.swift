import Foundation
import GRDB

enum AppDatabase {
    static func open(at url: URL) throws -> DatabasePool {
        let pool = try DatabasePool(path: url.path)
        try migrator.migrate(pool)
        return pool
    }

    static func inMemory() throws -> DatabaseQueue {
        let queue = try DatabaseQueue()
        try migrator.migrate(queue)
        return queue
    }

    static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_library") { db in
            try db.create(table: "artist") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("name", .text).notNull().collate(.nocase).unique()
            }

            try db.create(table: "album") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("title", .text).notNull().collate(.nocase)
                t.column("artistId", .integer).notNull().indexed()
                    .references("artist", onDelete: .cascade)
                t.column("artworkFile", .text)
                t.uniqueKey(["title", "artistId"])
            }

            try db.create(table: "track") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("title", .text).notNull()
                t.column("artistId", .integer).notNull().indexed()
                    .references("artist", onDelete: .cascade)
                t.column("albumId", .integer).notNull().indexed()
                    .references("album", onDelete: .cascade)
                t.column("trackNumber", .integer)
                t.column("discNumber", .integer)
                t.column("duration", .double).notNull().defaults(to: 0)
                t.column("fileName", .text).notNull().unique()
                t.column("contentHash", .text).notNull().unique()
                t.column("fileSize", .integer).notNull().defaults(to: 0)
                t.column("addedAt", .datetime).notNull().indexed()
                t.column("playCount", .integer).notNull().defaults(to: 0)
                t.column("lastPlayedAt", .datetime)
            }

            try db.create(table: "playlist") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("name", .text).notNull()
                t.column("createdAt", .datetime).notNull()
            }

            try db.create(table: "playlistTrack") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("playlistId", .integer).notNull()
                    .references("playlist", onDelete: .cascade)
                t.column("trackId", .integer).notNull().indexed()
                    .references("track", onDelete: .cascade)
                t.column("position", .integer).notNull()
                t.uniqueKey(["playlistId", "trackId"])
            }

            // Ordered rows; the same track may appear more than once.
            try db.create(table: "queueItem") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("trackId", .integer).notNull()
                    .references("track", onDelete: .cascade)
                t.column("position", .integer).notNull().indexed()
            }

            // Small key/value store: queue index, position, repeat mode.
            try db.create(table: "appState") { t in
                t.column("name", .text).notNull().primaryKey()
                t.column("value", .text).notNull()
            }
        }

        return migrator
    }
}
