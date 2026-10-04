# TrackInspect

- `ios/` — native iOS inspection app, Meta DAT, Mentra-compatible glasses and ElevenLabs voice.
- `web/` — web application.
- `agents/` — agent configuration.
- `notes/` — project notes.

## Repository locations

- GitHub: https://github.com/Tusoteuthis/Track-Inspect-hack-nation
- Gitea (private): https://git-dev.obachan.dev/budelius/Track-Inspect-hack-nation

Both remotes receive the same commits; no automatic server-side mirroring is configured:

```sh
git push origin main
git push gitea main
```

## iOS agent presets

Settings provides Expert and Tutor public-agent presets. Expert is the default when no saved agent preference exists; existing/custom IDs are preserved. Selection does not start audio or bypass cloud consent. No ElevenLabs API key belongs in the iOS app.
