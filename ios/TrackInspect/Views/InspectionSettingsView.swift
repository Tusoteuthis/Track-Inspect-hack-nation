import SwiftUI

struct InspectionSettingsView: View {
    @Binding var agentID: String
    @Bindable var mentra: MentraGlassesService
    var onPair: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var mentraModel = MentraGlassesModel.g1

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

                    section("Glasses", symbol: "eyeglasses") {
                        Text("Meta Ray-Ban").font(.subheadline.weight(.medium))
                        Text("Pair through Meta AI to bring your point of view into TrackInspect.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                        Button("Pair glasses in Meta AI", systemImage: "arrow.up.forward.app") {
                            dismiss()
                            onPair()
                        }.buttonStyle(InspectionButtonStyle(fullWidth: true))
                        InspectionRule()
                        Text("Requires your Meta app credentials and camera permission. Register trackinspect:// as the return link in the Meta developer portal.")
                            .font(.caption).foregroundStyle(InspectionTheme.secondary)
                    }

                    section("Mentra-compatible glasses", symbol: "eyeglasses") {
                        Text(mentra.statusText)
                            .font(.subheadline.weight(.medium))
                            .accessibilityIdentifier("mentraStatus")

                        if mentra.isConnected {
                            HStack {
                                Button("Disconnect") { mentra.disconnect() }
                                Button("Forget", role: .destructive) { mentra.forget() }
                            }
                            .buttonStyle(InspectionButtonStyle())

                            Button("Test text HUD", systemImage: "text.bubble") {
                                Task { await mentra.sendHUDTest() }
                            }
                            .buttonStyle(InspectionButtonStyle(fullWidth: true))
                            .disabled(!mentra.canRenderHUD)
                        } else {
                            Button("Reconnect saved glasses", systemImage: "arrow.clockwise") {
                                mentra.connectDefault()
                            }
                            .buttonStyle(InspectionButtonStyle(fullWidth: true))

                            Picker("Glasses model", selection: $mentraModel) {
                                ForEach(MentraGlassesModel.allCases) { model in
                                    Text(model.rawValue).tag(model)
                                }
                            }
                            .pickerStyle(.menu)

                            Button("Scan for \(mentraModel.rawValue)", systemImage: "dot.radiowaves.left.and.right") {
                                mentra.scan(model: mentraModel)
                            }
                            .buttonStyle(InspectionButtonStyle(fullWidth: true))
                            .disabled(mentra.isScanning)
                        }

                        if mentra.isScanning {
                            HStack {
                                ProgressView().accessibilityLabel("Scanning for Mentra glasses")
                                Button("Stop scan") { mentra.stopScan() }
                            }
                        }

                        ForEach(mentra.discovered) { device in
                            Button {
                                mentra.connect(id: device.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(device.name)
                                    Text(device.model).font(.caption).foregroundStyle(InspectionTheme.secondary)
                                }.frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(InspectionButtonStyle(fullWidth: true))
                        }

                        if let error = mentra.lastError {
                            Label(error, systemImage: "exclamationmark.triangle")
                                .font(.caption).foregroundStyle(.orange)
                        }

                        InspectionRule()
                        Text("Direct Bluetooth requires no Mentra account. G1, G2, and NIMO support short text guidance; Mentra Live has no working text HUD. The Mentra SDK does not provide in-process camera frames, so live local vision still requires Meta glasses or a selected photo.")
                            .font(.caption).foregroundStyle(InspectionTheme.text)
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
                            .font(.caption).foregroundStyle(InspectionTheme.text)
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
