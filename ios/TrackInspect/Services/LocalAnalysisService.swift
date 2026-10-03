import Foundation
import Vision
import CoreML

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
        if !loaded {
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
        let start = ContinuousClock.now
        let handler = VNImageRequestHandler(data: jpeg, options: [:])
        let observations: [VNClassificationObservation]
        let name: String
        if let customModel {
            let request = VNCoreMLRequest(model: customModel)
            request.imageCropAndScaleOption = .centerCrop
            configureCompute(request)
            try handler.perform([request])
            observations = try ClassifierContract.classifications(request.results)
            name = "InspectionClassifier · Core ML"
        } else {
            let request = VNClassifyImageRequest()
            configureCompute(request)
            try handler.perform([request])
            observations = request.results ?? []
            name = "Apple Vision · general classifier"
        }
        try Task.checkCancellation()
        let elapsed = start.duration(to: .now).components
        let milliseconds = Int(elapsed.attoseconds / 1_000_000_000_000_000) + Int(elapsed.seconds) * 1000
        return AnalysisResult(
            findings: ClassifierContract.filtered(observations.map {
                Finding(label: $0.identifier, confidence: $0.confidence)
            }),
            model: name, milliseconds: milliseconds, capturedAt: capturedAt
        )
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
