# Contracts

- **Route map (canonical):** [`notes/ws6-api-v0.md`](../../../notes/ws6-api-v0.md), status "v0, pending agreement".
- **Record definitions:** `web/lib/contracts/` (zod, `SCHEMA_VERSION = "ws6.v0"`). The field-level spec is in [data-model.md](../data-model.md).
- **Sample payloads:** `web/fixtures/ws6/`.

The only route implemented in Sprint 0:

```
GET /api/health → 200
{ "ok": true, "schema_version": "ws6.v0", "knowledge_dir_writable": true, "runtime_dir_writable": true, "modules": {} }
```

`ok` is false, and the status is 503, when either directory is not writable.
