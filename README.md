# 3 RAG FleetGuard

- FleetGuard: `index.html`
- Orders page: `orders-page.html`

Both pages share the Firebase project `rag-os-e9382` and link to each other, so they are deployed together.
The version that was live before 12 Oct 2026 is kept on the branch `backup-2026-10-12`.

## Security
- Database rules: `database.rules.json`, generated from `rules/build-rules.cjs` and tested with `cd rules && npm test`.
- What was changed in Phase 0 and the console steps that go with it: `PHASE-0.md`.
