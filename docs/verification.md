# Verification

The public import preserves the working editor and adds portable setup, contributor/agent guidance, licensing information, and CI. Historical private project reports, browser traces, and transcript excerpts are excluded. This page describes check scope rather than linking to unavailable local artifacts.

## Checks

- `npm test`: TypeScript unit coverage for caption cues, timecodes, edit comparisons, download ranges, suggestion settings, source validation, and transcript fingerprints.
- `npm run test:python`: standard-library tests for transcript section coverage, grounding, maximum durations, selection modes, duplicate filtering, and replay policy. Model responses are mocked where required.
- `npm run lint`, `npm run typecheck`, `npm run build`: static analysis and the production bundle.
- `npm run check:docs`: relative documentation file links; no excluded local-output links.
- `npm run test:captions`: real FFmpeg MP4/SRT generation from synthetic word timings, plus settings persistence and invalid-input checks.
- `npm run test:integration`: optional real Tiny recognition, media rendering, route validation, origin/host protection, cancellation, metadata recovery, and restart persistence.
- `npm run test:qwen`: optional real local inference, candidate acceptance, duplicate prevention, transcript staleness, cancellation, and persistence.
- `npm run test:youtube`: optional real upstream downloads and bounded range/deletion workflows.

See [testing](testing.md) for required tools, ports, model downloads, and isolated storage. CI runs ordinary checks on Node 22/24 and caption rendering on Ubuntu. The current CI result is available in [GitHub Actions](https://github.com/Batuktech/Cutroom/actions/workflows/ci.yml); a configured workflow is not itself proof of a passing run.

## Limits

Synthetic media validates mechanics, not general recognition quality. Qwen reads transcripts and can misjudge context or return fewer candidates than requested. Short excerpt latency is not a full-length speed prediction. Browser and libass rasterization may differ slightly. End-to-end behavior is tested on Linux; other operating systems and GPUs require additional validation.

New manual/transcript, fast-rule, and accepted AI clips use Highlight captions and 16:9. Existing clips are not migrated. Published screenshots use only the original synthetic demo.

## Initial public-import validation

A separate source-only checkout installed dependencies with `npm ci` on Node 24.16.0 and passed lint, TypeScript checking, 42 TypeScript tests, 11 standard-library Python tests, local documentation links, the production build, and four caption workflow checks with real FFmpeg output. No AI environment or model was copied into that checkout.

Vitest was upgraded to 4.1.11 to address [the upstream mocker advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9). The upgraded suite passed all 42 tests and typechecking; the complete npm audit reported zero advisories at preparation time. Advisory results can change as new issues are disclosed.

The bundled-demo editor screenshot was captured from the built app. Desktop (1600px) and mobile (390px) checks reported no page errors, zero axe violations, and no horizontal overflow. This scoped check does not certify every state or assistive technology. A source inventory excluded local environments, models, project data, browser traces, private identifiers, and generated reports. The repository retains the existing MIT license and records the source import in 50 scoped commits with current timestamps.
