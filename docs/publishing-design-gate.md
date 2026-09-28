# Publishing UI delivery gate

Scope: the new Postiz settings, social-copy editor, channel controls and submission history. This is a scoped verification, not an accessibility certification of the entire studio.

Direction: the existing [Cutroom design system](../opendesign/design-systems/cutroom/SKILL.md), with ENERGY 2 / RHYTHM 2 / MOTION 1. OpenDesign framed the workflow; the React Bits component check favored existing Radix controls without another animated dependency. Anti-Slop was applied during implementation.

## Hard gate

- R-02 PASS: the new publishing components contain no em dashes.
- R-03 PASS: independent browser verification at 320px found document width 320px and dialog client/scroll width 286px, without horizontal overflow.
- R-17 PASS: no engagement statistics or predicted views are displayed.
- R-18 PASS: no testimonials or customer personas were added.
- R-23 PASS: no logos, profile images or navigation structure were invented; channel names come from Postiz. Browser fixtures are explicitly synthetic.
- R-24 PASS: no new navigation links point to missing pages; settings opens the existing studio settings.
- R-25 PASS: scoped axe scans of settings and publishing reported zero violations; the initial publishing scan had no incomplete checks. A later scrolled scan left one partially clipped label's contrast incomplete; its existing cream/dark token pairing was checked separately.
- R-26 PASS: settings, generation, copy saving, channel selection, delivery controls and submission call real handlers; mock API integration exercises their server paths.
- R-27 PASS: browser checks exercised loading, missing-key, empty-channel, connection-error, progress and successful-submission states.
- R-28 PASS: no FAQ was added.
- R-32 PASS: keyboard navigation, visible focus and Escape were checked; focus returns to Prepare posts after closing.
- R-33 PASS: implementation lives in source files edited directly, not injected through an external patching script.
- R-34 PASS: this feature inherits the studio's single existing theme and adds no theme toggle.
- R-35 PASS: lint, typecheck and production build passed; browser checks exercised synthetic copy generation and multi-channel drafts. Live platform delivery and GPU inference remain explicitly unverified.
- R-36 PASS: the interface distinguishes Postiz acceptance from platform delivery and does not claim guaranteed reach or compliance.
- R-37 PASS: the existing design direction was read before implementation; no default replacement theme was introduced.
- R-38 PASS: no fictional product proof, staff or customer content was added.

## Purpose gate

- R-01 PASS: no new gradient or glow was added.
- R-04 PASS: existing download and close icons retain their literal actions; the new publishing action uses a text label.
- R-06 PASS: existing Manrope typography preserves the editor's compact, readable control language.
- R-07 PASS: no decorative background grid was added.
- R-08 PASS: arrows in settings instructions describe the navigation path, not decorative button styling.
- R-09 PASS: no promotional capsule badges were added.
- R-10 PASS: no glassmorphism layer was added.
- R-12 PASS: existing modal elevation is reused; individual form sections have no added shadow.
- R-13 PASS: no glow effects were added.
- R-14 PASS: content is grouped by copy, channels and delivery instead of an interchangeable feature-card grid.
- R-19 PASS: no decorative animation was added; existing reduced-motion behavior is preserved.
- R-22 PASS: no generic illustration was added.

## Liveliness

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 are explicit and inherited from the studio.
- Consistency PASS: warm charcoal, cream and restrained lime remain unchanged.
- Focal point PASS: Prepare posts is the primary editor action; the delivery button names the selected action.
- Whitespace PASS: separators and spacing distinguish copy editing, channel selection and external-upload consent.
- Accent PASS: lime marks the primary action rather than every form element.
- Identity PASS: the editor's compact typography, inset controls and clip summary carry into the dialog.
- Design read PASS: the existing product direction precedes the quality filter; no independent redesign was introduced.

## Craftsmanship and consistency

- C-1 PASS: color and typography preserve studio identity; grouping follows the publishing decisions.
- C-2 PASS: controls have working handlers; unavailable generation and submission show prerequisites.
- C-3 PASS: every section serves copy preparation, channel settings, delivery consent or submission recovery.
- C-4 PASS: desktop/mobile, keyboard, empty/error states and an actual mock submission were checked. Checkbox labels and form controls measured at least 44px high.
- C-5 PASS: AI output is marked for review, and completion reports only confirmed Postiz acceptance.
- R-05 PASS: this is a task dialog within the existing editor, not a new marketing-page template.
- R-11 PASS: existing button, input and dialog shapes are reused without making all elements pill-shaped.
- R-15 PASS: actions say Generate social copy, Save social copy, Render and schedule, or Render and publish.
- R-16 PASS: new copy contains no generic AI marketing slogans.
- R-20 PASS: the clip summary, per-platform copy and studio controls retain Cutroom's editing context.
- R-21 PASS: dark surfaces preserve the existing media-editing design, not a newly imposed theme.
- R-29 PASS: existing surface/text tokens and one lime action accent are reused.
- R-30 PASS: the implementation extends Cutroom rather than copying another product's shell.
- R-31 PASS: visual choices have a stated role: inherited identity, readable controls, clear grouping and explicit publishing consent.

## Evidence and limits

The independent browser check used only the bundled demo and blocked-network Postiz fixtures. It verified manual hashtags with multiple spaces, cloud-generation consent, private defaults, missing local-model handling, masked session keys, empty/error channels, two-channel drafts and the corrected terminal acceptance message. Scoped scans found zero axe violations; automated scans do not prove complete accessibility compliance. Console checks before intentional error injection reported no errors or warnings.

Automated checks: `npm run lint`, `npm run typecheck`, `npm test` (106 tests), `npm run test:python` (16 tests), `npm run test:postiz`, `npm run test:byok`, `npm run check:docs`, `npm run build`, and `git diff --check`. The build succeeds with a bundle-size advisory for the approximately 534 kB minified client chunk. Real credentials, account approvals, platform quotas and live publishing were not tested.

Implementation: [publishing dialog](../src/components/PublishDialog.tsx), [Postiz settings](../src/components/PostizSettings.tsx), [channel controls](../src/components/PublishingChannel.tsx), [styles](../src/styles/publishing.css), [publishing API](../server/publishing.ts), [Postiz client](../server/postiz.ts), [social-copy service](../server/social-copy.ts), [local worker](../scripts/social_copy_worker.py), and [shared validation](../shared/publishing.ts). See [setup and workflow](publishing.md) and [test instructions](testing.md).
