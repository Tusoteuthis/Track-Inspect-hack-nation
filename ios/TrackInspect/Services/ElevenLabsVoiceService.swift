import Foundation
import AVFoundation
import Combine
import ElevenLabs

/// The native ElevenLabs SDK owns microphone capture, echo cancellation, playback,
/// and interruptions via LiveKit. Never bundle an ElevenLabs API key.
@MainActor final class ElevenLabsVoiceService: VoiceService {
    var onStatus: ((String) -> Void)?
    var onTranscript: (([TranscriptLine]) -> Void)?
    var onMuted: ((Bool) -> Void)?
    private var conversation: Conversation?
    private var subscriptions: Set<AnyCancellable> = []

    func start(agentID: String) async throws {
        let id = agentID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { throw AppFailure(message: "Enter a public ElevenLabs agent ID in Settings.") }
        guard await AVAudioApplication.requestRecordPermission() else {
            throw AppFailure(message: "Microphone access denied. Enable it in iOS Settings.")
        }
        try Task.checkCancellation()
        let session = try await ElevenLabs.startConversation(agentId: id)
        if Task.isCancelled {
            await session.endConversation()
            throw CancellationError()
        }
        conversation = session
        session.$state.sink { [weak self] state in
            switch state {
            case .idle: self?.onStatus?("Idle")
            case .connecting: self?.onStatus?("Connecting")
            case .active: self?.onStatus?("Connected")
            case .ended: self?.onStatus?("Ended")
            case .error(let error): self?.onStatus?("Error: \(error)")
            }
        }.store(in: &subscriptions)
        session.$messages.sink { [weak self] messages in
            self?.onTranscript?(messages.suffix(100).map {
                TranscriptLine(id: String(describing: $0.id), speaker: String(describing: $0.role), text: $0.content)
            })
        }.store(in: &subscriptions)
        session.$isMuted.sink { [weak self] muted in self?.onMuted?(muted) }.store(in: &subscriptions)
    }

    func stop() async {
        let old = conversation
        conversation = nil
        subscriptions.removeAll()
        await old?.endConversation()
        onStatus?("Idle")
        onMuted?(true)
    }

    func setMuted(_ muted: Bool) async throws {
        try await conversation?.setMuted(muted)
    }

    func updateContext(_ text: String) async throws {
        guard let conversation, conversation.state.isActive else { return }
        try await conversation.updateContext(text)
    }
}
