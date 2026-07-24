# Contributing to Atlas

Thank you for contributing! Atlas is designed for long-term collaboration — these rules keep it maintainable.

## Ground Rules

1. **Everything in English** — code, comments, commits, PRs, issues, docs. No exceptions.
2. **Documentation first** — a gameplay change requires a [COMBAT_RULEBOOK.md](COMBAT_RULEBOOK.md) update _before_ implementation. A PR that changes gameplay behavior without a rulebook update will be rejected.
3. **Never invent rules** — if a rule is missing or ambiguous, add it to the relevant document's **Open Questions** section and ask, instead of assuming.
4. **Respect the phase roadmap** — see [ARCHITECTURE.md](ARCHITECTURE.md#roadmap). Code for future phases is not merged early.
5. Read [CLAUDE.md](CLAUDE.md) for the full standards: architecture rules, naming conventions, determinism requirements.

## Non-Negotiable Architecture Rules

- The server is authoritative; the client sends intentions only.
- Gameplay is deterministic: same inputs, same outputs — no dependence on framerate, network order, or rendering.
- Strict TypeScript; `any` is forbidden (enforced by ESLint).
- No circular dependencies (enforced by ESLint and TypeScript project references).
- Balance values live in configuration, never in code literals.

## Workflow

1. Fork / branch from `main`.
2. Make your change with focused commits (imperative mood: `Add fall damage resolution step`).
3. Verify locally before pushing:

```bash
npm run format:check
npm run lint
npm run build
npm test
```

4. Open a PR. The description must state which document(s) authorize the change.
5. CI must be green; gameplay engine changes (Phase 3+) require unit tests.

## License

By contributing, you agree that your contributions are licensed under [AGPL-3.0-only](LICENSE).
