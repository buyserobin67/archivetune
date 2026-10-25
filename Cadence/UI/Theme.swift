import SwiftUI

/// Cadence palette: ink-black surfaces with a violet → mint accent.
enum Theme {
    static let background = Color(red: 0.040, green: 0.043, blue: 0.067)
    static let surface = Color(red: 0.082, green: 0.086, blue: 0.122)
    static let surfaceRaised = Color(red: 0.122, green: 0.129, blue: 0.180)
    static let accent = Color(red: 0.616, green: 0.553, blue: 1.0)
    static let accentAlt = Color(red: 0.376, green: 0.878, blue: 0.784)
    static let textSecondary = Color.white.opacity(0.62)
    static let hairline = Color.white.opacity(0.08)

    static let accentGradient = LinearGradient(
        colors: [accent, accentAlt],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

enum Format {
    static func time(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "0:00" }
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }

    static func trackCount(_ count: Int) -> String {
        "\(count) \(count == 1 ? "song" : "songs")"
    }

    /// Stable across launches, unlike `hashValue`.
    static func stableHash(_ text: String) -> UInt64 {
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in text.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x100000001b3
        }
        return hash
    }
}
