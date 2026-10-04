# Contracts — WS6 Sprint 1

Canonical route map: [`notes/ws6-api-v0.md`](../../../notes/ws6-api-v0.md) §5.2–5.5 and §5.10 (updated in this sprint). Schemas: `web/lib/contracts` (`session.ts`, `asset.ts`, `expert.ts`, `bus.ts`). Request/response additions are listed in [`../data-model.md`](../data-model.md).

| Route | Lib function |
|---|---|
| `POST /api/sessions` | `sessions.createSession` |
| `GET /api/sessions/:sid` | `sessions.getSession` |
| `POST /api/sessions/:sid/lifecycle` | `sessions.changeLifecycle` (pure core: `session-lifecycle.applyLifecycle`) |
| `POST /api/sessions/:sid/record-state` | `sessions.changeRecordState` |
| `PUT /api/sessions/:sid/assets/:aid` | `assets.putAsset` |
| `GET /api/assets/:aid[/original\|/highlighted]` | `assets.getAsset`, `assets.readAssetFile` |
| `PUT/GET /api/sessions/:sid/events[/:eid]` | `events.putEvent`, `events.listEvents`, `events.getEvent` |
| `PUT/GET /api/sessions/:sid/exchanges[/:xid]` | `exchanges.putExchange`, `exchanges.listExchanges`, `exchanges.getExchange` |
| `GET /api/sessions/:sid/stream` | `sse.sessionStream` over `bus` |
| `GET /api/conversation-token?session_id=` | `sessions.requireActiveSession` |
