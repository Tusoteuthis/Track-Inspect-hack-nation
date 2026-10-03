import SwiftUI

/// A restrained, Linear-inspired visual language. No external assets or branded logos.
enum InspectionTheme {
    static let background = color(0x101114)
    static let surface = color(0x191A1F)
    static let recessed = color(0x141519)
    static let raised = color(0x24252C)
    static let border = color(0x34353F)
    static let text = color(0xF1F1F5)
    static let secondary = color(0xB6B8C5)
    static let accent = color(0xBAB3FF)
    static let primary = color(0x6354C7)
    static let success = color(0x98D9B1)
    static let corner: CGFloat = 12

    private static func color(_ value: UInt32) -> Color {
        Color(red: Double((value >> 16) & 255) / 255,
              green: Double((value >> 8) & 255) / 255,
              blue: Double(value & 255) / 255)
    }
}

struct InspectionPanel<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(InspectionTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: InspectionTheme.corner))
            .overlay {
                RoundedRectangle(cornerRadius: InspectionTheme.corner)
                    .strokeBorder(InspectionTheme.border, lineWidth: 1)
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
    }
}

struct InspectionButtonStyle: ButtonStyle {
    var prominent = false
    var fullWidth = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 44)
            .foregroundStyle(isEnabled ? InspectionTheme.text : InspectionTheme.secondary)
            .background(prominent && isEnabled ? InspectionTheme.primary : InspectionTheme.raised)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(prominent && isEnabled ? Color.white.opacity(0.14) : InspectionTheme.border, lineWidth: 1)
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct InspectionBadge: View {
    let text: String
    var symbol: String = "circle.dotted"
    var highlighted = false

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.caption.weight(.medium))
            .foregroundStyle(highlighted ? InspectionTheme.accent : InspectionTheme.secondary)
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(highlighted ? InspectionTheme.primary.opacity(0.16) : InspectionTheme.raised,
                        in: RoundedRectangle(cornerRadius: 6))
            .accessibilityElement(children: .combine)
    }
}

struct InspectionRule: View {
    var body: some View {
        Rectangle().fill(InspectionTheme.border).frame(height: 1).accessibilityHidden(true)
    }
}

/// Subtle camera framing, strictly decorative and excluded from accessibility.
struct ViewfinderGrid: View {
    var body: some View {
        Canvas { context, size in
            var grid = Path()
            for fraction in [1.0 / 3, 2.0 / 3] {
                grid.move(to: CGPoint(x: size.width * fraction, y: 0))
                grid.addLine(to: CGPoint(x: size.width * fraction, y: size.height))
                grid.move(to: CGPoint(x: 0, y: size.height * fraction))
                grid.addLine(to: CGPoint(x: size.width, y: size.height * fraction))
            }
            context.stroke(grid, with: .color(InspectionTheme.border.opacity(0.35)), lineWidth: 0.5)
        }.accessibilityHidden(true).allowsHitTesting(false)
    }
}
