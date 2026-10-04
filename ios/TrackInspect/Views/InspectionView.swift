import SwiftUI
import PhotosUI

struct InspectionView: View {
    @Bindable var model: InspectionViewModel
    @Bindable var mentra: MentraGlassesService
    @AppStorage("elevenLabsAgentID") private var agentID = AgentPreset.expert.agentID
    @AppStorage("videoSource") private var videoSource = VideoSource.glasses
    @AppStorage("voiceConnection") private var voiceConnection = VoiceConnection.direct
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var showSettings = false
    @State private var confirmVoice = false
    @State private var photo: PhotosPickerItem?

    private var controls: AnyLayout {
        textSize >= .xxxLarge
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
            : AnyLayout(HStackLayout(spacing: 10))
    }

    private var captureLabel: String {
        if model.isVideoStopping { return "Stopping" }
        if model.isVideoRunning { return model.preview == nil ? "Connecting" : "Live" }
        return model.preview == nil ? "Standby" : "Photo mode"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    workspaceHeader
                    cameraPanel
                    analysisPanel
                    if let capture = model.pointingCapture { targetPanel(capture) }
                    voicePanel
                    Label("Research prototype. Not a safety assessment.", systemImage: "info.circle")
                        .font(.caption).foregroundStyle(InspectionTheme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 2)
                }
                .frame(maxWidth: 720).padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 28)
                .frame(maxWidth: .infinity)
            }
            .accessibilityIdentifier("inspectionScroll")
            .background(InspectionTheme.background)
            .foregroundStyle(InspectionTheme.text)
            .navigationTitle("TrackInspect")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(InspectionTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Image(systemName: "square.stack.3d.up.fill")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(InspectionTheme.accent)
                        .frame(width: 30, height: 30)
                        .background(InspectionTheme.raised, in: RoundedRectangle(cornerRadius: 7))
                        .accessibilityHidden(true)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Settings", systemImage: "slider.horizontal.3") { showSettings = true }
                        .foregroundStyle(InspectionTheme.secondary)
                        .frame(minWidth: 44, minHeight: 44)
                        .accessibilityIdentifier("settingsButton")
                }
            }
            .sheet(isPresented: $showSettings) {
                InspectionSettingsView(agentID: $agentID, mentra: mentra, videoSource: $videoSource,
                                       voiceConnection: $voiceConnection, canUseBackendVoice: model.canUseBackendVoice, registrationStatus: model.glassesRegistration,
                                       isPairing: model.isPairing,
                                       connectionStatus: model.glassesConnection,
                                       refreshConnection: { model.refreshGlassesConnection() },
                                       isUnpairing: model.isUnpairing,
                                       isUnpairPending: model.isUnpairPending,
                                       unpairMessage: model.unpairMessage,
                                       onUnpair: { Task { await model.unpair() } }) {
                    Task { await model.pair() }
                }
            }
            .alert("Start cloud voice?", isPresented: $confirmVoice) {
                Button("Cancel", role: .cancel) {}
                Button("Start voice") { model.startVoice(agentID: agentID, connection: voiceConnection) }
            } message: {
                Text("Microphone audio will be streamed to ElevenLabs and its voice infrastructure. Video is never uploaded. Check your agent's retention settings before use.")
            }
            .alert("Attention", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
                Button("OK") { model.error = nil }
            } message: { Text(model.error ?? "") }
            .onAppear { agentID = AgentPreset.current(for: agentID) }
            .onChange(of: videoSource) {
                if model.isVideoRunning { Task { await model.stopVideo() } }
            }
            .task(id: photo) {
                guard let photo else { return }
                do {
                    guard let data = try await photo.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                        throw AppFailure(message: "This photo could not be decoded. Select a different image.")
                    }
                    try Task.checkCancellation()
                    model.analyzePhoto(image)
                } catch {
                    if !Task.isCancelled { model.error = error.localizedDescription }
                }
            }
        }
    }

    private var workspaceHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Workspace", systemImage: "square.grid.2x2")
                .font(.caption).foregroundStyle(InspectionTheme.secondary)
            controls {
                Text("Inspection").font(.title2.weight(.semibold)).tracking(-0.5)
                    .accessibilityAddTraits(.isHeader).accessibilityIdentifier("workspaceHeading")
                if !textSize.isAccessibilitySize { Spacer(minLength: 0) }
                InspectionBadge(text: captureLabel,
                                symbol: model.isVideoRunning ? "circle.fill" : "circle.dotted",
                                highlighted: model.isVideoRunning && model.preview != nil)
            }
            Text("Your point of view, with context.")
                .font(.subheadline).foregroundStyle(InspectionTheme.secondary)
        }.padding(.bottom, 2)
    }

    private var cameraPanel: some View {
        InspectionPanel {
            VStack(spacing: 0) {
                controls {
                    sectionTitle("Camera feed", symbol: "viewfinder")
                    if !textSize.isAccessibilitySize { Spacer(minLength: 0) }
                    Label("On device", systemImage: "lock.shield")
                        .font(.caption).foregroundStyle(InspectionTheme.secondary)
                }.padding(16)
                InspectionRule()
                if let image = model.preview {
                    Image(uiImage: image).resizable().scaledToFit()
                        .overlay {
                            if let tip = model.analysis?.pointing?.tip {
                                GeometryReader { area in
                                    if let box = model.analysis?.target?.box {
                                        Rectangle().strokeBorder(InspectionTheme.accent, lineWidth: 3)
                                            .frame(width: box.width * area.size.width, height: box.height * area.size.height)
                                            .position(x: box.midX * area.size.width, y: box.midY * area.size.height)
                                    }
                                    Circle().strokeBorder(InspectionTheme.accent, lineWidth: 3)
                                        .frame(width: 30, height: 30)
                                        .position(x: tip.x * area.size.width, y: tip.y * area.size.height)
                                }.accessibilityHidden(true)
                            }
                        }
                        .frame(maxHeight: 360)
                        .frame(maxWidth: .infinity).background(InspectionTheme.recessed)
                        .accessibilityLabel(!model.isVideoRunning ? "Selected test photo"
                                            : model.videoSource == .phone ? "Live iPhone camera preview" : "Live glasses preview")
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: videoSource == .phone ? "iphone" : "eyeglasses")
                            .font(.system(size: 27, weight: .regular))
                            .foregroundStyle(InspectionTheme.accent)
                            .frame(width: 58, height: 48)
                            .background(InspectionTheme.raised, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(InspectionTheme.border))
                            .accessibilityHidden(true)
                        Text(videoSource == .phone ? "Use your iPhone camera" : "Connect your glasses")
                            .font(.subheadline.weight(.medium))
                        Text(videoSource == .phone
                             ? "Stream this iPhone's back camera,\nor select a photo to try local analysis."
                             : "Stream your view from Meta Ray-Ban,\nor select a photo to try local analysis.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                    }
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                    .padding(24).frame(maxWidth: .infinity, minHeight: 186)
                    .background { InspectionTheme.recessed.overlay { ViewfinderGrid() } }
                }
                InspectionRule()
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 8) {
                        if model.isVideoBusy {
                            ProgressView().accessibilityLabel(model.videoSource == .phone ? "Starting iPhone camera" : "Connecting glasses")
                        } else {
                            Image(systemName: model.isVideoRunning ? "video" : "video.slash")
                                .accessibilityHidden(true)
                        }
                        Text(model.videoStatus).accessibilityIdentifier("videoStatus")
                    }.font(.caption).foregroundStyle(InspectionTheme.secondary)
                    if videoSource == .glasses, let registration = model.glassesRegistration {
                        Label(registration.message, systemImage: registration == .registered ? "checkmark.circle" : "arrow.up.forward.app")
                            .font(.caption).foregroundStyle(InspectionTheme.accent)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("glassesRegistrationStatus")
                    }
                    controls {
                        Button {
                            if model.isVideoRunning { Task { await model.stopVideo() } }
                            else { model.startVideo(source: videoSource) }
                        } label: {
                            Label(model.isVideoRunning ? "Stop video" : "Start video",
                                  systemImage: model.isVideoRunning ? "stop.fill" : "play.fill")
                        }
                        .buttonStyle(InspectionButtonStyle(prominent: true, fullWidth: true))
                        .accessibilityLabel(model.isVideoRunning ? "Stop video"
                                            : videoSource == .phone ? "Start iPhone video" : "Start glasses video")
                        .disabled(model.isVideoStopping).accessibilityIdentifier("videoControl")
                        PhotosPicker(selection: $photo, matching: .images) {
                            Label("Test photo", systemImage: "photo")
                        }
                        .buttonStyle(InspectionButtonStyle(fullWidth: true))
                        .accessibilityLabel("Analyze a test photo").accessibilityIdentifier("photoPicker")
                        .disabled(model.isVideoRunning || model.isVideoBusy || model.isVideoStopping)
                    }
                }.padding(16)
            }
        }
    }

    private var analysisPanel: some View {
        InspectionPanel {
            VStack(alignment: .leading, spacing: 14) {
                controls {
                    sectionTitle("Local vision", symbol: "square.stack.3d.up")
                    if !textSize.isAccessibilitySize { Spacer(minLength: 0) }
                    InspectionBadge(text: "Private", symbol: "lock")
                }
                if let result = model.analysis {
                    Text(result.model).font(.caption).foregroundStyle(InspectionTheme.secondary)
                    ForEach(result.findings) { finding in
                        controls {
                            Text(finding.label.replacingOccurrences(of: "_", with: " ")).font(.subheadline)
                            if !textSize.isAccessibilitySize { Spacer(minLength: 0) }
                            Text("\(Int(finding.confidence * 100))%")
                                .font(.caption.monospacedDigit()).foregroundStyle(InspectionTheme.accent)
                                .padding(.horizontal, 7).padding(.vertical, 4)
                                .background(InspectionTheme.raised, in: RoundedRectangle(cornerRadius: 5))
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(finding.label), confidence \(Int(finding.confidence * 100)) percent")
                    }
                    if result.findings.isEmpty {
                        Text("No confident classifications in this frame.")
                            .font(.subheadline).foregroundStyle(InspectionTheme.secondary)
                    }
                    controls {
                        Label(result.pointing.map { "Pointing \($0.direction)" + (result.target?.label.map { " at \($0.label.replacingOccurrences(of: "_", with: " "))" } ?? "") }
                              ?? "No pointing finger",
                              systemImage: "hand.point.up.left")
                            .font(.subheadline)
                            .foregroundStyle(result.pointing == nil ? InspectionTheme.secondary : InspectionTheme.text)
                        if !textSize.isAccessibilitySize { Spacer(minLength: 0) }
                        if let pointing = result.pointing {
                            Text("\(Int(pointing.confidence * 100))%")
                                .font(.caption.monospacedDigit()).foregroundStyle(InspectionTheme.accent)
                                .padding(.horizontal, 7).padding(.vertical, 4)
                                .background(InspectionTheme.raised, in: RoundedRectangle(cornerRadius: 5))
                        }
                    }
                    .accessibilityElement(children: .combine).accessibilityIdentifier("pointingStatus")
                    controls {
                        Label("\(result.milliseconds) ms", systemImage: "timer")
                        Text(result.capturedAt, style: .time)
                    }.font(.caption).foregroundStyle(InspectionTheme.secondary)
                } else {
                    Text("Waiting for a frame")
                        .font(.subheadline.weight(.medium))
                    Text("Analysis runs on your iPhone. Images never leave this device.")
                        .font(.caption).foregroundStyle(InspectionTheme.secondary)
                }
                InspectionRule()
                Text("General image labels and a hand-pose heuristic · Not a defect detector")
                    .font(.caption).foregroundStyle(InspectionTheme.secondary)
                InspectionRule()
                Toggle("Describe pointing targets with a cloud model", isOn: $model.describeTargets)
                    .font(.subheadline).disabled(!model.canDescribeTargets)
                    .accessibilityIdentifier("describeTargets")
                    .accessibilityHint("Uploads the annotated screenshot to the Passiv gateway.")
                Text(model.canDescribeTargets
                     ? "On by default. When you hold a point, the annotated screenshot is uploaded to the Passiv gateway and the description is given to the voice agent as a pointing event while a call is active. Builds with a backend token also store the frame and event in the inspection backend. Sent images cannot be recalled."
                     : "No Passiv key in this build. Add PASSIV_API_KEY to Secrets.xcconfig and rebuild.")
                    .font(.caption).foregroundStyle(InspectionTheme.secondary)
            }.fixedSize(horizontal: false, vertical: true).padding(16)
        }
    }

    private func targetPanel(_ capture: PointingCapture) -> some View {
        let name = capture.target.label.map { "\($0.label.replacingOccurrences(of: "_", with: " ")) · \(Int($0.confidence * 100))%" }
            ?? "No confident label for this region"
        let picture = Image(uiImage: capture.image)
        return InspectionPanel {
            VStack(alignment: .leading, spacing: 14) {
                controls {
                    sectionTitle("Pointing target", symbol: "scope")
                    if !textSize.isAccessibilitySize { Spacer(minLength: 0) }
                    Text(capture.capturedAt, style: .time).font(.caption).foregroundStyle(InspectionTheme.secondary)
                }
                picture.resizable().scaledToFit().frame(maxHeight: 360).frame(maxWidth: .infinity)
                    .background(InspectionTheme.recessed)
                    .accessibilityLabel("Frame with the pointing finger and a box on its target")
                Text(name).font(.subheadline).accessibilityIdentifier("pointingTarget")
                if let description = capture.description {
                    Label(description, systemImage: "cloud").font(.subheadline).textSelection(.enabled)
                        .accessibilityIdentifier("targetDescription")
                    if let status = capture.backendStatus {
                        Text(status).font(.caption).foregroundStyle(InspectionTheme.secondary)
                            .accessibilityIdentifier("backendStatus")
                    }
                } else if model.isDescribingTarget {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Asking the cloud model…").font(.caption).foregroundStyle(InspectionTheme.secondary)
                    }.accessibilityElement(children: .combine)
                }
                Text(capture.target.salient
                     ? "Pointing \(capture.pointing.direction) at the nearest standout object along the finger."
                     : "Pointing \(capture.pointing.direction). No standout object along the finger, so the box marks the area ahead of it.")
                    .font(.caption).foregroundStyle(InspectionTheme.secondary)
                ShareLink(item: picture, preview: SharePreview("Pointing target", image: picture)) {
                    Label("Share screenshot", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(InspectionButtonStyle(fullWidth: true)).accessibilityIdentifier("shareTarget")
                Text("Kept in memory until the next run or when the app leaves the foreground. Sharing is your choice.")
                    .font(.caption).foregroundStyle(InspectionTheme.secondary)
            }.fixedSize(horizontal: false, vertical: true).padding(16)
        }
    }

    private var voicePanel: some View {
        InspectionPanel {
            VStack(alignment: .leading, spacing: 14) {
                controls {
                    sectionTitle("Voice assistant", symbol: "waveform")
                    if !textSize.isAccessibilitySize { Spacer(minLength: 0) }
                    Text(model.voiceStatus).font(.caption)
                        .foregroundStyle(InspectionTheme.secondary)
                        .accessibilityIdentifier("voiceStatus")
                }
                if !model.isVoiceRunning {
                    Text("Talk through your inspection with an ElevenLabs agent.")
                        .font(.caption).foregroundStyle(InspectionTheme.secondary)
                }
                controls {
                    Button(model.isVoiceRunning ? "End voice" : "Talk to agent", systemImage: "waveform") {
                        if model.isVoiceRunning { Task { await model.stopVoice() } }
                        else { confirmVoice = true }
                    }
                    .buttonStyle(InspectionButtonStyle(fullWidth: true))
                    .disabled(model.isVoiceStopping).accessibilityIdentifier("voiceControl")
                    if model.isVoiceRunning {
                        Button(model.isMuted ? "Unmute" : "Mute", systemImage: model.isMuted ? "mic.slash" : "mic") {
                            Task { await model.toggleMute() }
                        }.buttonStyle(InspectionButtonStyle()).disabled(model.isVoiceBusy)
                    }
                    if model.isVoiceBusy { ProgressView().accessibilityLabel("Connecting voice") }
                }
                InspectionRule()
                Toggle("Share local findings with agent", isOn: $model.shareFindings)
                    .font(.subheadline).accessibilityIdentifier("shareFindings")
                    .accessibilityHint("Sends text summaries to ElevenLabs. Images stay on this device.")
                Text("Optional text context, every 5 seconds at most. Sent summaries cannot be recalled.")
                    .font(.caption).foregroundStyle(InspectionTheme.secondary)
                if model.isVoiceRunning {
                    Text(model.audioRoute).font(.caption).foregroundStyle(InspectionTheme.secondary)
                    controls {
                        Button("iPhone audio") { model.preferPhoneAudio(true) }
                        Button("Glasses Bluetooth") { model.preferPhoneAudio(false) }
                    }.buttonStyle(InspectionButtonStyle()).disabled(model.isVoiceBusy)
                }
                if !model.transcript.isEmpty {
                    InspectionRule()
                    ForEach(model.transcript.suffix(8)) { line in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(line.speaker.capitalized).font(.caption.weight(.medium))
                                .foregroundStyle(InspectionTheme.accent)
                            Text(line.text).font(.subheadline).textSelection(.enabled)
                                .frame(minHeight: 44, alignment: .leading)
                        }.accessibilityElement(children: .combine)
                    }
                }
                Label("Voice is processed in the cloud", systemImage: "cloud")
                    .font(.caption).foregroundStyle(InspectionTheme.secondary)
            }.fixedSize(horizontal: false, vertical: true).padding(16)
        }
    }

    private func sectionTitle(_ title: LocalizedStringKey, symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(InspectionTheme.text)
            .accessibilityAddTraits(.isHeader)
    }
}
