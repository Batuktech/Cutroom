# Frontend guidance

Follow the root [AGENTS.md](../AGENTS.md). Reuse the current React, Radix, CSS, typography, and design tokens. No new component library is required for routine UI work.

`Editor.tsx` owns saved/draft clip state. `SuggestionDialog.tsx` handles review controls and explicit candidate acceptance. `App.tsx` polls jobs and refreshes project metadata; background updates must not erase unsaved edits. `useVideoClock.ts` follows rendered frames. Caption preview and export share `shared/captions.ts`.

Use the synthetic sample for screenshots. Check 320px and desktop layouts, accessible names, focus, loading/error/empty states, and reduced motion when relevant. Preserve seeking and pause behavior when changing animated captions. Run lint, typecheck, tests, and a build for frontend behavior changes.
