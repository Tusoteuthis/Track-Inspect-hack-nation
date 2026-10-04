import AVFoundation
import CoreImage
import UIKit
import os

/// iPhone back camera as an alternative to DAT video. Video only; never touches the audio session.
@MainActor final class PhoneVideoService: FrameSource {
    var onFrame: ((UIImage) -> Void)?
    var onStatus: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    private let capture = PhoneCapture()
    private var errors: Task<Void, Never>?
    private var generation = UUID()

    func start() async throws {
        await stop()
        let run = generation
        do {
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized: break
            case .notDetermined:
                guard await AVCaptureDevice.requestAccess(for: .video) else { throw Self.denied }
            default: throw Self.denied
            }
            try Task.checkCancellation()
            guard generation == run else { throw CancellationError() }
            errors = Task { [weak self] in
                for await _ in NotificationCenter.default.notifications(named: AVCaptureSession.runtimeErrorNotification) {
                    guard let self, !Task.isCancelled, self.generation == run else { return }
                    self.onFailure?("The iPhone camera stopped unexpectedly. Restart video.")
                }
            }
            try await capture.start { [weak self] image in
                guard let self, self.generation == run else { return }
                self.onFrame?(image)
            }
            try Task.checkCancellation()
            guard generation == run else { throw CancellationError() }
            onStatus?("Waiting for first video frame…")
        } catch {
            await stop()
            throw error
        }
    }

    func stop() async {
        generation = UUID()
        errors?.cancel()
        errors = nil
        await capture.stop()
    }

    private static let denied = AppFailure(message: "Camera access is off for TrackInspect. Allow it in iOS Settings, then retry. Photo analysis works without the camera.")
}

/// Session work is confined to one serial queue; at most one frame is in flight to the main actor.
private final class PhoneCapture: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "ai.trackinspect.phone-camera")
    private let context = CIContext()
    private let inFlight = OSAllocatedUnfairLock(initialState: false)
    private var handler: (@MainActor @Sendable (UIImage) -> Void)?

    func start(handler: @escaping @MainActor @Sendable (UIImage) -> Void) async throws {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
            queue.async {
                do {
                    try self.configure()
                    self.handler = handler
                    self.session.startRunning()
                    done.resume()
                } catch {
                    done.resume(throwing: error)
                }
            }
        }
    }

    func stop() async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            queue.async {
                self.handler = nil
                if self.session.isRunning { self.session.stopRunning() }
                done.resume()
            }
        }
    }

    private func configure() throws {
        guard session.inputs.isEmpty else { return }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            throw AppFailure(message: "No iPhone camera is available on this device. Photo analysis still works.")
        }
        let input = try AVCaptureDeviceInput(device: device)
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.setSampleBufferDelegate(self, queue: queue)
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .vga640x480
        guard session.canAddInput(input), session.canAddOutput(output) else {
            throw AppFailure(message: "The iPhone camera could not be configured.")
        }
        session.addInput(input)
        session.addOutput(output)
        // The app is portrait-only on iPhone.
        if let connection = output.connection(with: .video), connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let handler, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let claimed = inFlight.withLock { busy in
            defer { busy = true }
            return !busy
        }
        guard claimed else { return }
        let frame = CIImage(cvPixelBuffer: buffer)
        guard let rendered = context.createCGImage(frame, from: frame.extent) else {
            inFlight.withLock { $0 = false }
            return
        }
        let image = UIImage(cgImage: rendered)
        Task { @MainActor [inFlight] in
            handler(image)
            inFlight.withLock { $0 = false }
        }
    }
}
