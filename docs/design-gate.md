# Design and verification guide

The visual direction is defined in [Cutroom's design system](../opendesign/design-systems/cutroom/SKILL.md): warm charcoal, cream text, lime for editing actions, Manrope, and restrained motion. ENERGY 2 / RHYTHM 2 / MOTION 1. The video is the main workspace; transcript and timeline controls support a concrete editing task.

Use existing components and tokens. Keep 44px touch targets, visible keyboard focus, readable muted text, responsive layouts down to 320px, and working loading/error/empty states. Any animation must support the editor and respect reduced motion. Captions follow media time, not decorative animation clocks.

Before shipping UI changes, check desktop/mobile reflow, keyboard focus/Escape, accessible labels, contrast, seeking/pausing, and unsaved draft preservation. Use the bundled synthetic demo for public screenshots. Run a browser accessibility scan where available, but do not claim complete accessibility compliance from automated results alone.

The public-source preparation keeps the existing design. The library project count is rendered directly; no copied React Bits component is included. This removes a component redistribution restriction without changing the displayed count or navigation. No new visual dependency or decorative effect was added.

See [testing](testing.md) for repeatable checks and [verification](verification.md) for their limits. Historical browser reports contain local project state and are not published.
