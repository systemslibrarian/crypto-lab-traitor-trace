/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * What the live oracle finds on this lab, over {dark, light} × {1280, 380} and
 * every state the drive builds, is exactly the two entries below — both in the
 * SHARED Crypto Lab top bar, and neither one this repo's to fix.
 *
 * `.cl-btn` draws its edge as
 * `1px solid color-mix(in srgb, var(--accent, #35d6bb) 38%, transparent)` over
 * the bar's fixed `#0b1512`. This lab's `--accent` is `#0369a1`, so the
 * composited edge resolves to 1.43:1 against the bar, IDENTICALLY IN BOTH
 * THEMES, because the bar is always dark and `--accent` is one value shared by
 * both themes here. The number is accent-dependent, which is why sibling repos
 * in this fleet record different ones for byte-identical CSS. `CLAUDE.md` is
 * explicit that a change every lab should get is a deliberate reviewed
 * fleet-wide pass and never an overwrite driven from one repo, so it is measured
 * here, ratcheted here, and reported upward.
 *
 * Everything inside `<main id="app">`, the hero and the footer is audited with
 * no exemption. Six findings that WERE here have been fixed rather than
 * baselined, and their absence from this file is the ratchet working: every
 * `#app button` (1.47:1 dark / 1.65:1 light, drawn with the surface-divider
 * `--border` over a fill 1.03:1 from its own panel — that is all sixteen
 * decoder cells plus every other button on the page); `button.primary`, whose
 * `--accent` fill was 2.92:1 against `--bg-panel` in dark with no other
 * delineator; and the subset-cover tree's node outlines, edges and
 * cover-subset outlines.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {
  'control-boundary|a.cl-btn': { ratio: 1.43, required: 3, unverified: false },
  'control-boundary|button#cl-theme-toggle.cl-btn.cl-icon': {
    ratio: 1.43,
    required: 3,
    unverified: false,
  },
};
