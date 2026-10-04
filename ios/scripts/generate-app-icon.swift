#!/usr/bin/env swift
// Run from the project root: swift scripts/generate-app-icon.swift
// Original TrackInspect artwork. RGB output; iOS applies the outer icon mask.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
precondition(FileManager.default.fileExists(atPath: root.appendingPathComponent("project.yml").path), "Run from the project root")
let catalog = root.appendingPathComponent("TrackInspect/Assets.xcassets")
let output = catalog.appendingPathComponent("AppIcon.appiconset")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let space = CGColorSpace(name: CGColorSpace.sRGB)!

func color(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: space, components: [
        CGFloat((hex >> 16) & 255) / 255,
        CGFloat((hex >> 8) & 255) / 255,
        CGFloat(hex & 255) / 255, alpha
    ])!
}

func canvas(_ size: Int) -> CGContext {
    CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
              space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
}

func gradient(_ colors: [CGColor]) -> CGGradient {
    CGGradient(colorsSpace: space, colors: colors as CFArray, locations: nil)!
}

let context = canvas(1024)
context.translateBy(x: 0, y: 1024)
context.scaleBy(x: 1, y: -1)
context.drawLinearGradient(gradient([color(0x22212D), color(0x101114)]),
                           start: CGPoint(x: 256, y: 0), end: CGPoint(x: 768, y: 1024), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
context.drawRadialGradient(gradient([color(0x6550B0, alpha: 0.24), color(0x6550B0, alpha: 0)]),
                           startCenter: CGPoint(x: 512, y: 380), startRadius: 0,
                           endCenter: CGPoint(x: 512, y: 380), endRadius: 560, options: [])

// Four open corners make a viewfinder without adding a second icon-shaped border.
let frame = CGMutablePath()
frame.move(to: CGPoint(x: 346, y: 228))
frame.addLine(to: CGPoint(x: 272, y: 228))
frame.addQuadCurve(to: CGPoint(x: 228, y: 272), control: CGPoint(x: 228, y: 228))
frame.addLine(to: CGPoint(x: 228, y: 346))
frame.move(to: CGPoint(x: 678, y: 228))
frame.addLine(to: CGPoint(x: 752, y: 228))
frame.addQuadCurve(to: CGPoint(x: 796, y: 272), control: CGPoint(x: 796, y: 228))
frame.addLine(to: CGPoint(x: 796, y: 346))
frame.move(to: CGPoint(x: 796, y: 678))
frame.addLine(to: CGPoint(x: 796, y: 752))
frame.addQuadCurve(to: CGPoint(x: 752, y: 796), control: CGPoint(x: 796, y: 796))
frame.addLine(to: CGPoint(x: 678, y: 796))
frame.move(to: CGPoint(x: 346, y: 796))
frame.addLine(to: CGPoint(x: 272, y: 796))
frame.addQuadCurve(to: CGPoint(x: 228, y: 752), control: CGPoint(x: 228, y: 796))
frame.addLine(to: CGPoint(x: 228, y: 678))

func strokeGradient(_ path: CGPath, width: CGFloat, colors: [CGColor]) {
    context.saveGState()
    context.addPath(path)
    context.setLineWidth(width)
    context.setLineCap(.round)
    context.setLineJoin(.round)
    context.replacePathWithStrokedPath()
    context.clip()
    context.drawLinearGradient(gradient(colors), start: CGPoint(x: 512, y: 200), end: CGPoint(x: 512, y: 810),
                               options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    context.restoreGState()
}

strokeGradient(frame, width: 36, colors: [color(0xBAB3FF), color(0x8979DE)])

// Perspective sleepers sit behind two continuous rails, retaining a strong small-size silhouette.
context.setStrokeColor(color(0x8B79DC))
context.setLineWidth(28)
context.setLineCap(.round)
for (left, right, y): (CGFloat, CGFloat, CGFloat) in [(422, 602, 408), (401, 623, 498), (378, 646, 588), (350, 674, 678)] {
    context.move(to: CGPoint(x: left, y: y))
    context.addLine(to: CGPoint(x: right, y: y))
    context.strokePath()
}
let rails = CGMutablePath()
rails.move(to: CGPoint(x: 444, y: 308))
rails.addCurve(to: CGPoint(x: 332, y: 724), control1: CGPoint(x: 421, y: 419), control2: CGPoint(x: 361, y: 617))
rails.move(to: CGPoint(x: 580, y: 308))
rails.addCurve(to: CGPoint(x: 692, y: 724), control1: CGPoint(x: 603, y: 419), control2: CGPoint(x: 663, y: 617))
strokeGradient(rails, width: 46, colors: [color(0xE3DFFF), color(0xAA96F4)])
let master = context.makeImage()!

struct Slot {
    let idiom: String
    let points: Double
    let scale: Int
    var pixels: Int { Int(points * Double(scale)) }
}
let slots: [Slot] = [
    Slot(idiom: "iphone", points: 20, scale: 2), Slot(idiom: "iphone", points: 20, scale: 3),
    Slot(idiom: "iphone", points: 29, scale: 2), Slot(idiom: "iphone", points: 29, scale: 3),
    Slot(idiom: "iphone", points: 40, scale: 2), Slot(idiom: "iphone", points: 40, scale: 3),
    Slot(idiom: "iphone", points: 60, scale: 2), Slot(idiom: "iphone", points: 60, scale: 3),
    Slot(idiom: "ipad", points: 20, scale: 1), Slot(idiom: "ipad", points: 20, scale: 2),
    Slot(idiom: "ipad", points: 29, scale: 1), Slot(idiom: "ipad", points: 29, scale: 2),
    Slot(idiom: "ipad", points: 40, scale: 1), Slot(idiom: "ipad", points: 40, scale: 2),
    Slot(idiom: "ipad", points: 76, scale: 1), Slot(idiom: "ipad", points: 76, scale: 2),
    Slot(idiom: "ipad", points: 83.5, scale: 2), Slot(idiom: "ios-marketing", points: 1024, scale: 1)
]
for pixels in Set(slots.map(\.pixels)).sorted() {
    let resized = canvas(pixels)
    resized.interpolationQuality = .high
    resized.draw(master, in: CGRect(x: 0, y: 0, width: pixels, height: pixels))
    let image = resized.makeImage()!
    let url = output.appendingPathComponent("AppIcon-\(pixels).png")
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    precondition(CGImageDestinationFinalize(destination), "PNG write failed")
    let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)! as NSDictionary
    precondition(properties[kCGImagePropertyHasAlpha] as? Bool != true, "Icon must not have an alpha channel")
    precondition(properties[kCGImagePropertyPixelWidth] as? Int == pixels)
    precondition(properties[kCGImagePropertyPixelHeight] as? Int == pixels)
    print("Validated \(pixels)×\(pixels) RGB icon")
}
let images: [[String: String]] = slots.map { slot in
    let points = slot.points == slot.points.rounded() ? String(Int(slot.points)) : String(slot.points)
    return ["idiom": slot.idiom, "size": "\(points)x\(points)", "scale": "\(slot.scale)x", "filename": "AppIcon-\(slot.pixels).png"]
}
let info: [String: Any] = ["author": "xcode", "version": 1]
try JSONSerialization.data(withJSONObject: ["images": images, "info": info], options: [.prettyPrinted, .sortedKeys])
    .write(to: output.appendingPathComponent("Contents.json"))
try JSONSerialization.data(withJSONObject: ["info": info], options: [.prettyPrinted, .sortedKeys])
    .write(to: catalog.appendingPathComponent("Contents.json"))
print("Generated AppIcon asset catalog.")
