import CoreML
import Vision

/// Explicit contract for optional bundled image classifiers; detector/VLM outputs are rejected.
enum ClassifierContract {
    static func validate(_ model: MLModelDescription) throws {
        let inputs = Array(model.inputDescriptionsByName.values)
        let label = model.predictedFeatureName.flatMap { model.outputDescriptionsByName[$0]?.type }
        let probabilities = model.predictedProbabilitiesName.flatMap { model.outputDescriptionsByName[$0]?.type }
        try validateSignature(
            imageInputs: inputs.filter { $0.type == .image }.count,
            otherRequiredInputs: inputs.filter { $0.type != .image && !$0.isOptional }.count,
            labelType: label, probabilitiesType: probabilities
        )
    }

    static func validateSignature(imageInputs: Int, otherRequiredInputs: Int,
                                  labelType: MLFeatureType?, probabilitiesType: MLFeatureType?) throws {
        guard imageInputs == 1, otherRequiredInputs == 0,
              labelType == .string || labelType == .int64, probabilitiesType == .dictionary else {
            throw AppFailure(message: "InspectionClassifier must accept one image and output a predicted label plus class probabilities. Detectors and language models need a different analysis adapter.")
        }
    }

    static func classifications(_ observations: [VNObservation]?) throws -> [VNClassificationObservation] {
        guard let observations, let results = observations as? [VNClassificationObservation] else {
            throw AppFailure(message: "InspectionClassifier returned non-classification output.")
        }
        return results
    }

    static func filtered(_ findings: [Finding]) -> [Finding] {
        var seen: Set<String> = []
        return Array(findings
            .filter { !$0.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.confidence.isFinite && (0.1...1).contains($0.confidence) }
            .sorted { $0.confidence == $1.confidence ? $0.label < $1.label : $0.confidence > $1.confidence }
            .filter { seen.insert($0.label).inserted }
            .prefix(5))
    }
}
