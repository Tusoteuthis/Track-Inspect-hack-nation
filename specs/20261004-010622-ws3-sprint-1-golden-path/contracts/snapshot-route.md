# `PUT /api/expert-sessions/[sessionId]/snapshot`

- The body is a full `SessionSnapshot` (see data-model.md).
- Before writing, the route checks that `sessionId` matches `^[a-z0-9-]{1,64}$` and equals `body.session_id`, then runs `validateSessionSnapshot(body)`.
- It writes the 6 files to `${KNOWLEDGE_DIR ?? <web>/../knowledge}/sessions/<sessionId>/`. Each file is first written to a `.tmp-…` file and then renamed into place.
- The operation is idempotent: the same body always produces the same files.

| Status | Body |
|---|---|
| 200 | `{ "saved_at": "<iso>", "files": ["session.json", …] }` |
| 400 | `{ "error": "...", "details": ["..."] }` for an invalid id, invalid JSON or failed validation |
| 500 | `{ "error": "..." }` for a write failure |
