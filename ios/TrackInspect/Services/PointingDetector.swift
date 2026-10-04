import CoreGraphics
import Vision

/// An extended index finger found by the on-device hand-pose model.
struct Pointing: Sendable, Equatable {
    /// Fingertip in unit image coordinates, origin top-left.
    let tip: CGPoint
    /// Knuckle-to-fingertip offset in the same coordinates; the ray the finger extends along.
    let heading: CGVector
    /// Direction within the image, e.g. "up-right"; not a real-world bearing.
    let direction: String
    let confidence: Float
}

/// The image region a pointing finger is aimed at.
struct PointingTarget: Sendable, Equatable {
    /// Unit image coordinates, origin top-left.
    let box: CGRect
    /// False when no salient object lay along the finger and the box is only the area ahead of it.
    let salient: Bool
    /// Best local classification of the boxed region, when one was confident enough.
    var label: Finding? = nil
}

/// Geometric rule over hand-pose joints: a gesture heuristic, not a trained pointing classifier.
enum PointingDetector {
    struct Finger {
        let mcp, pip, tip: CGPoint
    }

    private static let directions = ["right", "up-right", "up", "up-left", "left", "down-left", "down", "down-right"]

    /// Joints in Vision's unit coordinates (origin bottom-left); `aspect` is image width / height.
    /// The index must be straight and reach away from the wrist while every other given finger is curled.
    static func pointing(wrist: CGPoint, index: Finger, others: [Finger],
                         aspect: CGFloat, confidence: Float) -> Pointing? {
        func scaled(_ point: CGPoint) -> CGPoint { CGPoint(x: point.x * aspect, y: point.y) }
        func vector(_ from: CGPoint, _ to: CGPoint) -> CGVector {
            let a = scaled(from), b = scaled(to)
            return CGVector(dx: b.x - a.x, dy: b.y - a.y)
        }
        func length(_ v: CGVector) -> CGFloat { hypot(v.dx, v.dy) }

        let base = vector(index.mcp, index.pip), end = vector(index.pip, index.tip)
        let reach = vector(index.mcp, index.tip)
        guard length(base) > 0, length(end) > 0,
              // Within about 45° of straight.
              (base.dx * end.dx + base.dy * end.dy) / (length(base) * length(end)) >= 0.7,
              length(vector(wrist, index.tip)) > length(vector(wrist, index.pip)),
              others.allSatisfy({ length(vector($0.mcp, $0.tip)) < 0.7 * length(reach) }) else { return nil }

        let sector = Int((atan2(reach.dy, reach.dx) / (.pi / 4)).rounded())
        return Pointing(tip: CGPoint(x: index.tip.x, y: 1 - index.tip.y),
                        heading: CGVector(dx: index.tip.x - index.mcp.x, dy: index.mcp.y - index.tip.y),
                        direction: directions[(sector + 8) % 8], confidence: confidence)
    }

    /// The candidate box (unit coordinates, origin top-left) the finger's ray enters first, skipping any that
    /// contain the fingertip itself (the hand). Without a hit, a square ahead of the fingertip.
    static func target(for pointing: Pointing, candidates: [CGRect], aspect: CGFloat) -> PointingTarget {
        let tip = pointing.tip, heading = pointing.heading
        let hits = candidates.filter { !$0.contains(tip) }.compactMap { box -> (box: CGRect, entry: CGFloat)? in
            var entry: CGFloat = 0, exit = CGFloat.infinity
            for (origin, delta, low, high) in [(tip.x, heading.dx, box.minX, box.maxX), (tip.y, heading.dy, box.minY, box.maxY)] {
                if delta == 0 {
                    if origin < low || origin > high { return nil }
                    continue
                }
                let a = (low - origin) / delta, b = (high - origin) / delta
                entry = max(entry, min(a, b))
                exit = min(exit, max(a, b))
            }
            return entry <= exit ? (box, entry) : nil
        }
        if let nearest = hits.min(by: { $0.entry < $1.entry }) {
            return PointingTarget(box: nearest.box, salient: true)
        }
        // Square in pixel terms starting at the fingertip and extending ahead of it, kept inside the image.
        let side = 0.3 * min(aspect, 1), width = side / aspect
        let dx = heading.dx * aspect, dy = heading.dy, norm = max(hypot(dx, dy), .leastNonzeroMagnitude)
        let x = tip.x + dx / norm * side / 2 / aspect - width / 2, y = tip.y + dy / norm * side / 2 - side / 2
        return PointingTarget(box: CGRect(x: min(max(x, 0), 1 - width), y: min(max(y, 0), 1 - side),
                                          width: width, height: side), salient: false)
    }

    /// The most confident pointing hand, if any.
    static func pointing(in hands: [VNHumanHandPoseObservation], aspect: CGFloat) -> Pointing? {
        hands.compactMap { hand -> Pointing? in
            guard let joints = try? hand.recognizedPoints(.all) else { return nil }
            func point(_ name: VNHumanHandPoseObservation.JointName) -> CGPoint? {
                joints[name].flatMap { $0.confidence >= 0.3 ? $0.location : nil }
            }
            func finger(_ mcp: VNHumanHandPoseObservation.JointName, _ pip: VNHumanHandPoseObservation.JointName,
                        _ tip: VNHumanHandPoseObservation.JointName) -> Finger? {
                guard let mcp = point(mcp), let pip = point(pip), let tip = point(tip) else { return nil }
                return Finger(mcp: mcp, pip: pip, tip: tip)
            }
            guard let wrist = point(.wrist), let index = finger(.indexMCP, .indexPIP, .indexTip) else { return nil }
            // Curled fingers are often occluded; joints the model cannot see are not held against the gesture.
            let others = [finger(.middleMCP, .middlePIP, .middleTip), finger(.ringMCP, .ringPIP, .ringTip),
                          finger(.littleMCP, .littlePIP, .littleTip)].compactMap { $0 }
            return pointing(wrist: wrist, index: index, others: others, aspect: aspect,
                            confidence: joints[.indexTip]?.confidence ?? 0)
        }.max { $0.confidence < $1.confidence }
    }
}
