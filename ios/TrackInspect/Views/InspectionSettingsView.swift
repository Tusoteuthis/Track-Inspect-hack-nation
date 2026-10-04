import SwiftUI

struct InspectionSettingsView: View {
    @Binding var agentID: String
    var videoSource: Binding<VideoSource> = .constant(.glasses)
    var registrationStatus: GlassesRegistrationStatus? = nil
    var isPairing = false
    var connectionStatus: GlassesConnectionStatus = .checking
    var refreshConnection: () -> Void = {}
    var isUnpairing = false
    var isUnpairPending = false
    var unpairMessage: String? = nil
    var onUnpair: () -> Void = {}
    var onPair: () -> Void
    @State private var confirmUnpair = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    private var visibleConnection: GlassesConnectionStatus {
        scenePhase == .active ? connectionStatus : .paused
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Workspace settings")
                            .font(.title2.weight(.semibold)).tracking(-0.5)
                            .accessibilityAddTraits(.isHeader).accessibilityIdentifier("setupIntroduction")
                        Text("Connect your devices and configure your assistant.")
                            .font(.subheadline).foregroundStyle(InspectionTheme.secondary)
                    }.padding(.bottom, 4)

                    section("Video source", symbol: "video") {
                        HStack(spacing: 10) {
                            ForEach(VideoSource.allCases) { source in
                                Button {
                                    videoSource.wrappedValue = source
                                } label: {
                                    Label(source.title, systemImage: videoSource.wrappedValue == source ? "checkmark.circle.fill" : "circle")
                                }
                                .buttonStyle(InspectionButtonStyle(fullWidth: true))
                                .accessibilityIdentifier("videoSource_\(source.rawValue)")
                                .accessibilityAddTraits(videoSource.wrappedValue == source ? [.isSelected] : [])
                            }
                        }
                        Text("Choose where live video comes from. The iPhone option uses the back camera and needs no glasses or Meta setup. Changing the source stops a running stream.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                    }

                    section("Glasses", symbol: "eyeglasses") {
                        Text("Meta Ray-Ban").font(.subheadline.weight(.medium))
                        Text("Connection mode: \(Self.installedMetaMode)")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                            .accessibilityIdentifier("metaConnectionMode")
                        VStack(alignment: .leading, spacing: 6) {
                            Label(visibleConnection.title, systemImage: visibleConnection.symbol)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(InspectionTheme.text)
                                .accessibilityIdentifier("glassesConnectionStatus")
                            Text(visibleConnection.detail)
                                .font(.caption).foregroundStyle(InspectionTheme.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
                        .background(InspectionTheme.recessed, in: RoundedRectangle(cornerRadius: 8))
                        Text(registrationStatus?.message ?? "Pair through Meta AI to bring your point of view into TrackInspect.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                        Button("Pair glasses in Meta AI", systemImage: "arrow.up.forward.app") {
                            dismiss()
                            onPair()
                        }.buttonStyle(InspectionButtonStyle(fullWidth: true))
                            .disabled(isPairing || isUnpairing || isUnpairPending)
                        Button("Unpair TrackInspect", systemImage: "link.badge.plus", role: .destructive) {
                            confirmUnpair = true
                        }
                        .buttonStyle(InspectionButtonStyle(fullWidth: true))
                        .disabled(isPairing || isUnpairing)
                        .accessibilityIdentifier("unpairGlasses")
                        if let unpairMessage {
                            Text(unpairMessage).font(.caption).foregroundStyle(InspectionTheme.secondary)
                                .accessibilityIdentifier("unpairStatus")
                        }
                        InspectionRule()
                        Text("Requires your Meta app credentials and camera permission. Register trackinspect:// as the return link in the Meta developer portal.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                    }

                    section("Voice agent", symbol: "waveform") {
                        Text("ElevenLabs").font(.subheadline.weight(.medium))
                        HStack(spacing: 10) {
                            ForEach(AgentPreset.allCases) { preset in
                                Button {
                                    agentID = preset.agentID
                                } label: {
                                    Label(preset.title, systemImage: agentID == preset.agentID ? "checkmark.circle.fill" : "circle")
                                }
                                .buttonStyle(InspectionButtonStyle(fullWidth: true))
                                .accessibilityIdentifier("agentPreset_\(preset.rawValue)")
                                .accessibilityAddTraits(agentID == preset.agentID ? [.isSelected] : [])
                            }
                        }
                        Text("Public agent ID").font(.caption).foregroundStyle(InspectionTheme.secondary)
                        TextField(text: $agentID, prompt: Text("Enter your agent ID").foregroundStyle(InspectionTheme.secondary)) {
                            Text("Public agent ID")
                        }
                            .font(.subheadline).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .padding(.horizontal, 12).padding(.vertical, 11).frame(minHeight: 44)
                            .background(InspectionTheme.recessed, in: RoundedRectangle(cornerRadius: 8))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8).strokeBorder(InspectionTheme.border)
                                    .allowsHitTesting(false).accessibilityHidden(true)
                            }
                            .accessibilityLabel("Public ElevenLabs agent ID").accessibilityIdentifier("agentID")
                        Text("Use a public agent for this prototype. Enter an agent ID, never an API key. Private agents require a backend-issued conversation token.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                    }

                    section("Audio routing", symbol: "headphones") {
                        Text("Choose your input during a call")
                            .font(.subheadline.weight(.medium))
                        Text("The voice SDK captures the active iOS microphone. Request Glasses Bluetooth during a call and check the displayed route. If voice interrupts video, select iPhone audio and restart the video stream.")
                            .font(.caption).foregroundStyle(InspectionTheme.text)
                    }

                    section("Privacy & limits", symbol: "lock.shield") {
                        Label("Video stays on your iPhone", systemImage: "checkmark.shield")
                            .font(.subheadline)
                        Text("Voice and optional text summaries go to ElevenLabs. No recordings are saved by this app. Capture stops when the app enters the background.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                        InspectionRule()
                        Text("General image classification, not certified defect detection. Do not use this prototype to assess track safety.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                    }

                    section("Application", symbol: "square.stack.3d.up") {
                        Text("TrackInspect").font(.subheadline.weight(.medium))
                        Text(Bundle.main.bundleIdentifier ?? "Unknown")
                            .font(.footnote.monospaced()).foregroundStyle(InspectionTheme.secondary)
                            .accessibilityLabel("Application identifier")
                            .accessibilityValue(Bundle.main.bundleIdentifier ?? "Unknown")
                            .accessibilityIdentifier("applicationIdentity")
                        Text("Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—") · Build \(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—")")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                        Text("Meta callback: trackinspect://").font(.caption).foregroundStyle(InspectionTheme.secondary)
                    }
                }
                .frame(maxWidth: 720).padding(20).frame(maxWidth: .infinity)
            }
            .alert("Unpair TrackInspect?", isPresented: $confirmUnpair) {
                Button("Cancel", role: .cancel) {}
                Button("Unpair", role: .destructive) { onUnpair() }
            } message: {
                Text("This stops video and voice and removes TrackInspect's Meta authorization. Your glasses stay paired with your iPhone and Meta AI. You can register TrackInspect again afterward.")
            }
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                while !Task.isCancelled {
                    refreshConnection()
                    do { try await Task.sleep(for: .seconds(1)) } catch { return }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .foregroundStyle(InspectionTheme.text)
            .background(InspectionTheme.background)
            .navigationTitle("Setup").navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(InspectionTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .font(.subheadline.weight(.medium)).frame(minWidth: 44, minHeight: 44)
                }
            }
        }
    }

    static var installedMetaMode: String {
        let config = Bundle.main.object(forInfoDictionaryKey: "MWDAT") as? [String: Any]
        guard let usesDam = config?["DAMEnabled"] as? Bool else { return "Not specified" }
        return usesDam ? "DAM" : "Legacy camera (without DAM)"
    }

    private func section<Content: View>(_ title: LocalizedStringKey, symbol: String,
                                       @ViewBuilder content: () -> Content) -> some View {
        InspectionPanel {
            VStack(alignment: .leading, spacing: 12) {
                Label(title, systemImage: symbol)
                    .font(.subheadline.weight(.semibold)).accessibilityAddTraits(.isHeader)
                InspectionRule()
                content()
            }.fixedSize(horizontal: false, vertical: true).padding(16)
        }
    }
}
