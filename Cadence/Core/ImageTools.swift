import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

/// Wrapper so decoded images can cross concurrency domains regardless of SDK annotations.
struct LoadedImage: @unchecked Sendable {
    let image: UIImage
}

enum ImageTools {
    static func downsample(_ source: CGImageSource, maxPixel: CGFloat) -> CGImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    /// Re-encodes arbitrary image data as a bounded-size JPEG.
    static func jpegData(from data: Data, maxPixel: CGFloat, quality: CGFloat = 0.85) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = downsample(source, maxPixel: maxPixel) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        let properties: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}

final class ArtworkCache: @unchecked Sendable {
    static let shared = ArtworkCache()

    private let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 300
        return cache
    }()

    func image(for key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func store(_ image: UIImage, for key: String) {
        cache.setObject(image, forKey: key as NSString)
    }
}

enum ArtworkLoader {
    static func key(file: String, pixel: CGFloat) -> String {
        "\(file)@\(Int(pixel))"
    }

    static func image(at url: URL, key: String, maxPixel: CGFloat) async -> LoadedImage? {
        if let cached = ArtworkCache.shared.image(for: key) {
            return LoadedImage(image: cached)
        }
        let loaded = await Task.detached(priority: .utility) { () -> LoadedImage? in
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let cgImage = ImageTools.downsample(source, maxPixel: maxPixel) else { return nil }
            return LoadedImage(image: UIImage(cgImage: cgImage))
        }.value
        if let loaded {
            ArtworkCache.shared.store(loaded.image, for: key)
        }
        return loaded
    }
}
