import UIKit

/// Paints the pointing finger and its target box onto the analysed frame. Nothing is written to disk.
enum PointingSnapshot {
    static func render(jpeg: Data, pointing: Pointing, target: PointingTarget) -> Data? {
        guard let image = UIImage(data: jpeg) else { return nil }
        let size = image.size
        let format = UIGraphicsImageRendererFormat()
        format.scale = image.scale
        format.opaque = true
        let line = max(3, min(size.width, size.height) / 120)
        func place(_ point: CGPoint) -> CGPoint { CGPoint(x: point.x * size.width, y: point.y * size.height) }
        let tip = place(pointing.tip)
        let knuckle = place(CGPoint(x: pointing.tip.x - pointing.heading.dx, y: pointing.tip.y - pointing.heading.dy))
        let box = CGRect(x: target.box.minX * size.width, y: target.box.minY * size.height,
                         width: target.box.width * size.width, height: target.box.height * size.height)
        return UIGraphicsImageRenderer(size: size, format: format).jpegData(withCompressionQuality: 0.9) { renderer in
            image.draw(in: CGRect(origin: .zero, size: size))
            let context = renderer.cgContext
            context.setLineCap(.round)
            // Dark underlay keeps the violet strokes visible on any background.
            for (color, width) in [(UIColor.black, line * 2), (UIColor(red: 0.62, green: 0.52, blue: 1, alpha: 1), line)] {
                context.setStrokeColor(color.cgColor)
                context.setLineWidth(width)
                context.setLineDash(phase: 0, lengths: [])
                context.stroke(box)
                context.strokeEllipse(in: CGRect(x: tip.x - line * 3, y: tip.y - line * 3, width: line * 6, height: line * 6))
                context.strokeLineSegments(between: [knuckle, tip])
                context.setLineDash(phase: 0, lengths: [line * 3, line * 4])
                context.strokeLineSegments(between: [tip, CGPoint(x: box.midX, y: box.midY)])
            }
            guard let label = target.label else { return }
            let text = "\(label.label.replacingOccurrences(of: "_", with: " ")) \(Int(label.confidence * 100))%" as NSString
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: line * 5, weight: .semibold), .foregroundColor: UIColor.white
            ]
            let extent = text.size(withAttributes: attributes)
            let tag = CGRect(x: min(box.minX, size.width - extent.width - line * 2),
                             y: box.minY >= extent.height + line ? box.minY - extent.height - line : box.minY,
                             width: extent.width + line * 2, height: extent.height + line)
            context.setFillColor(UIColor.black.withAlphaComponent(0.75).cgColor)
            context.fill(tag)
            text.draw(at: CGPoint(x: tag.minX + line, y: tag.minY + line / 2), withAttributes: attributes)
        }
    }
}
