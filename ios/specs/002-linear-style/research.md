# Research

- **Decision**: interpret Linear inspiration as restrained charcoal layers, hairline borders, compact typography, violet actions and low-radius controls. **Rationale**: recognizable aesthetic without copying logos or making TrackInspect a project tracker. **Alternative**: only change tint; rejected as too shallow.
- **Decision**: reusable native SwiftUI tokens/styles and scrollable settings panels. **Rationale**: consistency across preview, analysis, voice and setup with no dependency overhead. **Alternative**: web/CSS wrapper; rejected by native-stack requirements.
- **Decision**: preserve all action labels/IDs and privacy controls. **Rationale**: style changes must not compromise behavior or tests.
- **Decision**: keep 44 pt minimum controls and scalable semantic typography. **Rationale**: Linear-like density does not justify inaccessible tap targets or fixed small text. Existing audits previously caught small-caption contrast on narrow screens; run them again.
