import Foundation
import UIKit
import Vision
import CoreImage
import React

@objc(BackgroundRemover)
class BackgroundRemover: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func isSupported(_ resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 17.0, *) {
      resolve(true)
    } else {
      resolve(false)
    }
  }

  @objc
  func checkModelStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    var response = [String: Any]()
    if #available(iOS 17.0, *) {
      response["available"] = true
    } else {
      response["available"] = false
      response["reason"] = "Requires iOS 17.0 or higher for Vision Foreground Instance Segmentation"
    }
    resolve(response)
  }

  @objc
  func downloadModel(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    // Apple Vision foreground segmentation is built into iOS 17.0+ system firmware; no download needed
    var response = [String: Any]()
    response["installed"] = true
    response["alreadyInstalled"] = true
    resolve(response)
  }

  @objc
  func removeBackground(_ imageUri: String,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    removeBackgroundWithOptions(imageUri, options: nil, resolver: resolve, rejecter: reject)
  }

  @objc
  func removeBackgroundWithOptions(_ imageUri: String,
                                   options: NSDictionary?,
                                   resolver resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      if #available(iOS 17.0, *) {
        do {
          guard !imageUri.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            reject("E_INVALID_URI", "Image URI cannot be empty", nil)
            return
          }

          let fileURL: URL
          if imageUri.hasPrefix("file://") {
            guard let parsed = URL(string: imageUri) else {
              reject("E_INVALID_URI", "Invalid file URL: \(imageUri)", nil)
              return
            }
            fileURL = parsed
          } else if imageUri.hasPrefix("/") {
            fileURL = URL(fileURLWithPath: imageUri)
          } else {
            guard let parsed = URL(string: imageUri) else {
              reject("E_INVALID_URI", "Invalid URI: \(imageUri)", nil)
              return
            }
            fileURL = parsed
          }

          let imageData = try Data(contentsOf: fileURL)

          guard let uiImage = UIImage(data: imageData) else {
            reject("E_DECODE_FAILED", "Failed to decode image from data", nil)
            return
          }

          guard let ciImage = CIImage(image: uiImage) else {
            reject("E_DECODE_FAILED", "Failed to create CIImage", nil)
            return
          }

          let request = VNGenerateForegroundInstanceMaskRequest()
          let orientation = self.cgImagePropertyOrientation(from: uiImage.imageOrientation)
          let handler = VNImageRequestHandler(ciImage: ciImage, orientation: orientation, options: [:])
          try handler.perform([request])

          guard let result = request.results?.first else {
            reject("E_NO_SUBJECT", "No foreground product or subject could be detected in this image.", nil)
            return
          }

          // Generate scaled mask matching original dimensions
          let maskPixelBuffer = try result.generateScaledMaskForImage(
            forInstances: result.allInstances,
            from: handler
          )
          let maskImage = CIImage(cvPixelBuffer: maskPixelBuffer)

          let blendFilter = CIFilter(name: "CIBlendWithMask")
          blendFilter?.setValue(ciImage, forKey: kCIInputImageKey)
          blendFilter?.setValue(CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0)), forKey: kCIInputBackgroundImageKey)
          blendFilter?.setValue(maskImage, forKey: kCIInputMaskImageKey)

          guard let outputCIImage = blendFilter?.outputImage else {
            reject("E_BLEND_FAILED", "Failed to apply transparency mask", nil)
            return
          }

          let context = CIContext(options: nil)
          guard let cgImage = context.createCGImage(outputCIImage, from: ciImage.extent) else {
            reject("E_RENDER_FAILED", "Failed to render transparent image", nil)
            return
          }

          let transparentUIImage = UIImage(cgImage: cgImage)

          // 1. Detect tight bounding box of subject
          let bounds = self.findSubjectBounds(image: transparentUIImage)
          let croppedProduct: UIImage
          if let b = bounds, b.width > 10 && b.height > 10 {
            let cropRenderer = UIGraphicsImageRenderer(size: b.size)
            croppedProduct = cropRenderer.image { _ in
              transparentUIImage.draw(at: CGPoint(x: -b.origin.x, y: -b.origin.y))
            }
          } else {
            croppedProduct = transparentUIImage
          }

          // 2. Options configuration
          let canvasSize: CGFloat = (options?["outputSize"] as? CGFloat) ?? 1024.0
          let rawPadding: CGFloat = (options?["padding"] as? CGFloat) ?? 0.10
          let paddingRatio: CGFloat = min(max(rawPadding, 0.02), 0.40)
          let padding = canvasSize * paddingRatio
          let availableSize = canvasSize - (padding * 2.0)

          let scale = min(availableSize / croppedProduct.size.width, availableSize / croppedProduct.size.height)
          let scaledWidth = croppedProduct.size.width * scale
          let scaledHeight = croppedProduct.size.height * scale
          let destX = (canvasSize - scaledWidth) / 2.0
          let destY = (canvasSize - scaledHeight) / 2.0
          let destRect = CGRect(x: destX, y: destY, width: scaledWidth, height: scaledHeight)

          let bgHex = (options?["backgroundColor"] as? String) ?? "#FFFFFF"
          let bgColor = self.parseHexColor(bgHex)

          // 3. Generate Studio Product Photography Image
          let canvasRenderer = UIGraphicsImageRenderer(size: CGSize(width: canvasSize, height: canvasSize))
          let studioImage = canvasRenderer.image { ctx in
            bgColor.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))
            croppedProduct.draw(in: destRect)
          }

          // 4. Generate Centered Transparent PNG Image
          let transCanvasImage = canvasRenderer.image { _ in
            croppedProduct.draw(in: destRect)
          }

          guard let jpegData = studioImage.jpegData(compressionQuality: 0.92) else {
            reject("E_ENCODE_FAILED", "Failed to encode studio JPEG", nil)
            return
          }

          guard let pngData = transCanvasImage.pngData() else {
            reject("E_ENCODE_FAILED", "Failed to encode transparent PNG", nil)
            return
          }

          let timestamp = Int(Date().timeIntervalSince1970 * 1000)
          let randomId = Int.random(in: 1000...9999)
          let tempDir = FileManager.default.temporaryDirectory

          let studioFilename = "bg_studio_\(timestamp)_\(randomId).jpg"
          let studioURL = tempDir.appendingPathComponent(studioFilename)
          try jpegData.write(to: studioURL)

          let pngFilename = "bg_removed_\(timestamp)_\(randomId).png"
          let transURL = tempDir.appendingPathComponent(pngFilename)
          try pngData.write(to: transURL)

          let backgroundMode = (options?["backgroundMode"] as? String)?.lowercased() ?? "studio"
          let isTransparent = backgroundMode == "transparent"
          let primaryUri = isTransparent ? transURL.absoluteString : studioURL.absoluteString

          var res = [String: Any]()
          res["uri"] = primaryUri
          res["studioUri"] = studioURL.absoluteString
          res["transparentUri"] = transURL.absoluteString
          res["width"] = canvasSize
          res["height"] = canvasSize
          res["format"] = isTransparent ? "png" : "jpg"
          res["studioEnhanced"] = true
          res["productAspectRatio"] = Double(croppedProduct.size.width / croppedProduct.size.height)
          resolve(res)

        } catch {
          reject("E_PROCESSING_FAILED", error.localizedDescription, error)
        }
      } else {
        reject("E_UNSUPPORTED_OS_VERSION", "On-device background removal requires iOS 17.0 or higher.", nil)
      }
    }
  }

  @objc
  func cleanupTempFiles(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .background).async {
      let tempDir = FileManager.default.temporaryDirectory
      var deletedCount = 0
      if let files = try? FileManager.default.contentsOfDirectory(at: tempDir, includingPropertiesForKeys: [.contentModificationDateKey], options: .skipsHiddenFiles) {
        let now = Date()
        for file in files {
          let name = file.lastPathComponent
          if name.hasPrefix("bg_removed_") || name.hasPrefix("bg_studio_") {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: file.path),
               let modDate = attrs[.modificationDate] as? Date,
               now.timeIntervalSince(modDate) > 3600 {
              try? FileManager.default.removeItem(at: file)
              deletedCount += 1
            }
          }
        }
      }
      resolve(deletedCount)
    }
  }

  private func findSubjectBounds(image: UIImage, alphaThreshold: UInt8 = 20) -> CGRect? {
    guard let cgImage = image.cgImage else { return nil }
    let width = cgImage.width
    let height = cgImage.height
    guard width > 0 && height > 0 else { return nil }

    var rawData = [UInt8](repeating: 0, count: width * height * 4)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
      data: &rawData,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
    ) else {
      return nil
    }

    // Flip context so row 0 in rawData corresponds to top of image
    context.translateBy(x: 0, y: CGFloat(height))
    context.scaleBy(x: 1.0, y: -1.0)
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

    var minX = width
    var maxX = -1
    var minY = height
    var maxY = -1

    for y in 0..<height {
      let rowStart = y * (width * 4)
      for x in 0..<width {
        let alpha = rawData[rowStart + x * 4 + 3]
        if alpha > alphaThreshold {
          if x < minX { minX = x }
          if x > maxX { maxX = x }
          if y < minY { minY = y }
          if y > maxY { maxY = y }
        }
      }
    }

    if maxX < minX || maxY < minY {
      return nil
    }

    let pMinX = max(0, minX - 4)
    let pMinY = max(0, minY - 4)
    let pMaxX = min(width - 1, maxX + 4)
    let pMaxY = min(height - 1, maxY + 4)

    return CGRect(x: pMinX, y: pMinY, width: pMaxX - pMinX + 1, height: pMaxY - pMinY + 1)
  }

  private func parseHexColor(_ hex: String) -> UIColor {
    var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if hexSanitized.hasPrefix("#") {
      hexSanitized.remove(at: hexSanitized.startIndex)
    }
    var rgb: UInt64 = 0
    guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else {
      return .white
    }
    if hexSanitized.count == 6 {
      let r = CGFloat((rgb & 0xFF0000) >> 16) / 255.0
      let g = CGFloat((rgb & 0x00FF00) >> 8) / 255.0
      let b = CGFloat(rgb & 0x0000FF) / 255.0
      return UIColor(red: r, green: g, blue: b, alpha: 1.0)
    }
    return .white
  }

  private func cgImagePropertyOrientation(from orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch orientation {
    case .up: return .up
    case .upMirrored: return .upMirrored
    case .down: return .down
    case .downMirrored: return .downMirrored
    case .left: return .left
    case .leftMirrored: return .leftMirrored
    case .right: return .right
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
