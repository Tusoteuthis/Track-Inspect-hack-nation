import XCTest
import Vision
import CoreML
@testable import TrackInspect

final class ClassifierContractTests: XCTestCase {
    func testMalformedImageFailsInsteadOfReturningLabels() async {
        do {
            _ = try await LocalAnalysisService().analyze(jpeg: Data("not an image".utf8), capturedAt: .now)
            XCTFail("Invalid image must throw")
        } catch { /* Expected decoder/Vision error. */ }
    }

    func testInvalidCustomModelDoesNotSilentlyFallBack() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let model = LocalAnalysisService(modelURL: directory.appendingPathComponent("Invalid.mlmodelc"))
        do {
            _ = try await model.analyze(jpeg: Data(), capturedAt: .now)
            XCTFail("Broken custom model must not silently fall back")
        } catch { /* Expected Core ML load error. */ }
    }

    func testNonClassificationVisionOutputIsRejected() {
        XCTAssertThrowsError(try ClassifierContract.classifications(nil))
        XCTAssertThrowsError(try ClassifierContract.classifications([VNRectangleObservation()]))
        XCTAssertNoThrow(try ClassifierContract.classifications([]))
    }

    func testOnlyImageClassifierSignaturesAreAccepted() {
        XCTAssertNoThrow(try ClassifierContract.validateSignature(imageInputs: 1, otherRequiredInputs: 0, labelType: .string, probabilitiesType: .dictionary))
        XCTAssertNoThrow(try ClassifierContract.validateSignature(imageInputs: 1, otherRequiredInputs: 0, labelType: .int64, probabilitiesType: .dictionary))
        XCTAssertThrowsError(try ClassifierContract.validateSignature(imageInputs: 0, otherRequiredInputs: 0, labelType: .string, probabilitiesType: .dictionary))
        XCTAssertThrowsError(try ClassifierContract.validateSignature(imageInputs: 1, otherRequiredInputs: 1, labelType: .string, probabilitiesType: .dictionary))
        XCTAssertThrowsError(try ClassifierContract.validateSignature(imageInputs: 1, otherRequiredInputs: 0, labelType: .multiArray, probabilitiesType: .multiArray))
    }

    func testFindingsAreFiniteSortedUniqueAndBounded() {
        let input: [Finding] = [
            .init(label: "rail", confidence: 0.2), .init(label: "rail", confidence: 0.9),
            .init(label: "", confidence: 1), .init(label: "NaN", confidence: .nan),
            .init(label: "invalid", confidence: 1.1), .init(label: "weak", confidence: 0.09)
        ] + (0..<10).map { .init(label: "label-\($0)", confidence: 0.5) }
        let findings = ClassifierContract.filtered(input)
        XCTAssertEqual(findings.count, 5)
        XCTAssertEqual(findings.first?.label, "rail")
        XCTAssertEqual(findings.first?.confidence, 0.9)
        XCTAssertEqual(Set(findings.map(\.label)).count, findings.count)
        XCTAssertTrue(findings.allSatisfy { $0.confidence.isFinite && (0.1...1).contains($0.confidence) })
    }
}
