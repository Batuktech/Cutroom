# Backend guidance

Follow the root [AGENTS.md](../AGENTS.md). Routes validate requests; services coordinate work; store transactions serialize metadata updates. There is no tenant or account system: keep this server on loopback.

Preserve source fingerprints and cancellation checks inside asynchronous store transactions. A worker result must not overwrite newer transcript edits or save after cancellation. Accepting suggestions must validate review/candidate IDs and avoid duplicate clips.

Never use user input in shell command strings. Resolve downloads through registered file IDs. Preserve file-protocol restrictions, size/duration limits, Origin/Host checks, shared-file deletion guards, and cleanup of incomplete outputs. Use synthetic projects and isolated data for API tests. See `docs/testing.md` for prerequisites before running integration suites.
