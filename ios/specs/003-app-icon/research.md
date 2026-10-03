# Icon decisions

- CoreGraphics creates original scalable geometry and reproducible PNGs using the existing macOS toolchain; no external image, license, font or model dependency.
- Conventional explicit iPhone/iPad/marketing slots preserve iOS 17 compatibility and make small-size outputs easy to inspect. One default appearance is sufficient; no separate dark/tinted artwork is promised.
- Opaque RGB context and ImageIO encoding avoid App Store alpha-channel problems. The full square remains unmasked; iOS applies its own corners.
- The build number was already 3 before this task; preserve it rather than reverting to the prior style feature's documented build 2.

No runtime data model or service contract changes; the only interface is the Xcode AppIcon asset/compiled bundle metadata.
