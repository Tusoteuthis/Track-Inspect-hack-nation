import SwiftUI

@main struct TrackInspectApp: App {
    @State private var model = InspectionViewModel(
        video: MetaVideoService(),
        phoneVideo: PhoneVideoService(),
        analyzer: LocalAnalysisService(),
        voice: ElevenLabsVoiceService(),
        describer: PassivVisionService(),
        recorder: BackendPointingRecorder(),
        voiceTokens: BackendConversationTokens()
    )
    @State private var mentra = MentraGlassesService()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            InspectionView(model: model, mentra: mentra)
                .preferredColorScheme(.dark)
                .tint(InspectionTheme.accent)
                .onOpenURL { url in Task { await model.handle(url: url) } }
                .onChange(of: scenePhase) { _, phase in
                    // Foreground-only MVP: no invisible microphone or camera capture.
                    if phase == .background { model.setForeground(false) }
                    else if phase == .active { model.setForeground(true) }
                }
        }
    }
}
