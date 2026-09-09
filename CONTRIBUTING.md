# Contributing to Cutroom

Cutroom is a local video editor. Useful contributions include reproducible bug reports, caption/timing fixes, accessible editing controls, hardware compatibility reports, and documentation that works on a fresh checkout.

## Start locally

Follow [installation](docs/installation.md), fork the repository, and create a topic branch. Use npm and the committed lockfile. Keep changes focused; discuss substantial architecture changes in an issue before implementing them.

```sh
npm ci
npm run dev
```

Manual editing and the bundled sample work without downloading AI models. See [testing](docs/testing.md) before running optional model or network tests.

## Before a pull request

```sh
npm run lint
npm run typecheck
npm test
npm run test:python
npm run check:docs
npm run build
```

- Explain the problem, the resulting behavior, and how you checked it.
- Add regression coverage for behavior changes. For UI work, check keyboard use and narrow screens and include a screenshot made with the bundled sample.
- Preserve existing project metadata, source files, old clip settings, cancellation, and transcript edit protections.
- Keep model weights, media from users, `.env`, private transcripts, browser traces, and generated outputs out of commits.
- Use synthetic or permission-cleared fixtures. Share short, redacted logs rather than whole libraries.
- Keep dependencies justified. Preserve upstream licenses and notices for copied code, fonts, and assets.
- AI-assisted contributions are welcome. Review the code yourself and describe verification and remaining uncertainty. Read [AGENTS.md](AGENTS.md) for repository boundaries.

Use clear commit messages such as `fix: preserve captions after cancelled transcription`. Avoid unrelated formatting changes and lockfile churn. Maintainers review scope, behavior, tests, and compatibility; contribution does not guarantee acceptance or a release date.

Contributions are submitted under the repository's [MIT license](LICENSE), except files that already carry their own license. Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), not public bug reports.
