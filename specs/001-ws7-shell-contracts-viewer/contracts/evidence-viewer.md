# Contract: EvidenceViewer (UI component)

```ts
<EvidenceViewer
  asset: EvidenceAsset
  region?: EvidenceRegion | null
  mode?: "focus" | "full"        // initial mode, default "full"; user can toggle
  caption?: string
/>
```

| Region render state | Outline | Text shown |
|---|---|---|
| none | — | — |
| resolved | solid 4px + label chip "Indicated region" | — |
| ambiguous | dashed 4px + label chip | "Ambiguous region" |
| unresolved | — | "Region unresolved: no highlight" |
| frame_mismatch | — | "Region belongs to a different frame" |
| invalid (coordinates outside [0,1] or empty) | — | "Region data invalid: no highlight shown" |

- Focus mode is only available for `resolved`/`ambiguous`. It crops to the region with 50% padding and a minimum window of 20%, using the same normalized span on both axes so the crop keeps the image's aspect ratio. The crop is clamped to the image.
- A label near the top edge moves inside the outline so it isn't clipped.
- The "Inspect" button opens a modal `<dialog>` with the full image. Esc closes it and focus returns to the button.
- Image load failure shows "Image could not be loaded" and no outline.
- Test hooks: `data-testid="region-outline"` and `data-render-state` on the root.
