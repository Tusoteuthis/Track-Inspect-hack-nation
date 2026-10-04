import Foundation
import Vision
import CoreML
import ImageIO

/// Serial inference off the main actor. No image leaves the device.
actor LocalAnalysisService: AnalysisService {
    private var customModel: VNCoreMLModel?
    private var loaded = false
    private let modelURL: URL?

    init(modelURL: URL? = Bundle.main.url(forResource: "InspectionClassifier", withExtension: "mlmodelc")) {
        self.modelURL = modelURL
    }

    func analyze(jpeg: Data, capturedAt: Date) async throws -> AnalysisResult {
        try Task.checkCancellation()
        try loadModel()
        let start = ContinuousClock.now
        let hands = VNDetectHumanHandPoseRequest()
        hands.maximumHandCount = 2
        configureCompute(hands)
        let (findings, name) = try classify(VNImageRequestHandler(data: jpeg, options: [:]), alongside: [hands])
        let pointing = PointingDetector.pointing(in: hands.results ?? [], aspect: Self.aspect(of: jpeg))
        try Task.checkCancellation()
        let located = try pointing.map { try target(of: $0, in: jpeg) }
        try Task.checkCancellation()
        let elapsed = start.duration(to: .now).components
        let milliseconds = Int(elapsed.attoseconds / 1_000_000_000_000_000) + Int(elapsed.seconds) * 1000
        return AnalysisResult(findings: findings, model: name, milliseconds: milliseconds, capturedAt: capturedAt,
                              pointing: pointing, target: located?.target, snapshot: located?.snapshot)
    }

    /// Boxes the salient object the finger is aimed at (or the area ahead of it), classifies that region,
    /// and paints both onto the frame.
    func target(of pointing: Pointing, in jpeg: Data) throws -> (target: PointingTarget, snapshot: Data?) {
        try loadModel()
        let handler = VNImageRequestHandler(data: jpeg, options: [:])
        let saliency = VNGenerateObjectnessBasedSaliencyImageRequest()
        #if !targetEnvironment(simulator)
        // The simulator cannot create an inference context for the saliency model; there the target
        // is always the area ahead of the fingertip.
        try handler.perform([saliency])
        #endif
        // Vision's origin is bottom-left; boxes are kept top-left like the fingertip.
        let candidates = (saliency.results?.first?.salientObjects ?? []).map(\.boundingBox).map {
            CGRect(x: $0.minX, y: 1 - $0.maxY, width: $0.width, height: $0.height)
        }
        var target = PointingDetector.target(for: pointing, candidates: candidates, aspect: Self.aspect(of: jpeg))
        let region = CGRect(x: target.box.minX, y: 1 - target.box.maxY, width: target.box.width, height: target.box.height)
            .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        if !region.isEmpty {
            target.label = try classify(handler, region: region).findings.first
        }
        return (target, PointingSnapshot.render(jpeg: jpeg, pointing: pointing, target: target))
    }

    private func loadModel() throws {
        guard !loaded else { return }
        if let url = modelURL {
            let config = MLModelConfiguration()
            #if targetEnvironment(simulator)
            config.computeUnits = .cpuOnly
            #else
            config.computeUnits = .all
            #endif
            let model = try MLModel(contentsOf: url, configuration: config)
            try ClassifierContract.validate(model.modelDescription)
            customModel = try VNCoreMLModel(for: model)
        }
        loaded = true
    }

    /// Classifies the whole image, or only `region` (unit coordinates, origin bottom-left).
    private func classify(_ handler: VNImageRequestHandler, region: CGRect? = nil,
                          alongside others: [VNRequest] = []) throws -> (findings: [Finding], model: String) {
        let observations: [VNClassificationObservation]
        let name: String
        if let customModel {
            let request = VNCoreMLRequest(model: customModel)
            request.imageCropAndScaleOption = .centerCrop
            if let region { request.regionOfInterest = region }
            configureCompute(request)
            try handler.perform([request] + others)
            observations = try ClassifierContract.classifications(request.results)
            name = "InspectionClassifier · Core ML"
        } else {
            let request = VNClassifyImageRequest()
            if let region { request.regionOfInterest = region }
            configureCompute(request)
            try handler.perform([request] + others)
            observations = request.results ?? []
            name = "Apple Vision · general classifier"
        }
        return (ClassifierContract.filtered(observations.map {
            Finding(label: $0.identifier, confidence: $0.confidence)
        }), name)
    }

    /// Width / height as displayed, so joint geometry is not distorted by unit coordinates.
    private static func aspect(of jpeg: Data) -> CGFloat {
        guard let source = CGImageSourceCreateWithData(jpeg as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? CGFloat,
              let height = properties[kCGImagePropertyPixelHeight] as? CGFloat, width > 0, height > 0 else { return 1 }
        // EXIF orientations 5–8 are rotated a quarter turn.
        let rotated = (properties[kCGImagePropertyOrientation] as? Int ?? 1) >= 5
        return rotated ? height / width : width / height
    }

    private func configureCompute(_ request: VNRequest) {
        #if targetEnvironment(simulator)
        // Simulator runtimes may expose Metal without a usable Espresso GPU context.
        let cpu = MLComputeDevice.allComputeDevices.first {
            if case .cpu = $0 { return true }
            return false
        }
        request.setComputeDevice(cpu, for: .main)
        #endif
    }
}
