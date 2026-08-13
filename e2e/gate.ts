import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate on Traitor Trace.
 *
 * WHAT THE SPEC THIS REPLACES ACTUALLY DID. Its whole drive was one
 * `driveDemos()`, and it is the purest example in this sweep of a gate that
 * built a great deal and measured almost none of it:
 *
 *  1. IT INJECTED MOTION SUPPRESSION —
 *     `*,*::before,*::after{animation:none!important;transition:none!important}`
 *     through `addStyleTag`. That BYPASSED this stylesheet's own
 *     `@media (prefers-reduced-motion: reduce)` block, which declares the
 *     identical thing, instead of exercising it — and it could not reproduce the
 *     part that matters, because `dom.ts`'s `pause()` reads
 *     `matchMedia('(prefers-reduced-motion: reduce)')` ITSELF and skips its
 *     420ms delay when the preference is set. Injected CSS does not move that
 *     media query, so the old gate sat through every staged delay it was trying
 *     to remove, and never measured the rendering a reduced-motion reader gets.
 *
 *  2. IT FORCE-OPENED ALL SIX DISCLOSURES FROM SCRIPT, with
 *     `document.querySelectorAll('details').forEach(d => d.open = true)`.
 *     Setting `.open` is not the route a reader has; clicking the `<summary>`
 *     is, and it is the only route that proves the summary is operable.
 *
 *  3. IT SCANNED ONCE, AT THE END, AFTER OVERWRITING EVERYTHING. The drive
 *     walked all four exhibits — the rekey storm, the preset revocation, a
 *     revoked subscriber's detail, an authorized one's, the complete-subtree
 *     flip, building a decoder, tracing it, revoking the accused, pooling
 *     revoked keys, the box's-eye probe view and twenty-five collusion traces —
 *     and then called `scan()` a single time. Every one of those panels renders
 *     through `clear()` into the same node, so Exhibit 2's cover status, header
 *     list and detail box had each been replaced four times over, and Exhibit
 *     3's probe transcript wiped and rebuilt, before anything looked.
 *
 *  4. IT SCANNED ONE VIEWPORT AND ONE PROJECT'S WORTH OF STATE. The a11y spec
 *     never set a viewport, so it inherited whichever project ran it, and the
 *     `@media (max-width: 640px)` block that drops `.subscriber-grid` and
 *     `.trait-checks` from eight columns to four was never deliberately
 *     rendered or measured. This gate sets both viewports explicitly.
 *
 *  5. IT NEVER TOUCHED THE BRANCHES THE LAB IS ABOUT. It left the decoder
 *     strategy on its shipped `evasive` default — the branch where tracing
 *     FAILS — so the `greedy` branch where the guarantee holds was never
 *     rendered. It never built an empty decoder, never revoked everybody, never
 *     picked the same subscriber twice, and never clicked a leaf on the tree.
 *
 * And `scan()` asserted `violations` alone, which is not a complete oracle:
 * reflow (1.4.10) and non-text contrast (1.4.11) have no axe rule at all, and
 * `incomplete` — where every `color-mix()` surface on this page lands — was
 * never read. `style.css` even states the 1.4.11 problem in a comment on
 * `--border-strong` and then applies the fix to two selectors out of
 * twenty-three; a comment is not a check.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 *
 * This lab's own reduced-motion block is the unusually broad kind —
 * `*, *::before, *::after { transition: none !important; animation: none
 * !important }` — so under the preference this gate asserts there is genuinely
 * nothing left running, including the shared top bar's `.cl-btn` transitions and
 * the tree's `stroke`/`fill` transitions. That makes quiescence cheap here and
 * the check nearly free; it is kept because it is also what proves the block
 * really applied, and because `pause()` in `dom.ts` is a JS timer the block
 * cannot touch.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders invisible for every reader with the preference set.
 *
 * This lab declares no `@keyframes` at all, so nothing here can be stranded by a
 * cancelled animation today. The check runs in every state regardless, because
 * "no keyframes" is a property of the current stylesheet rather than of the
 * page, and because this lab DOES stage its output over time: `dom.ts`'s
 * `pause(420)` sequences the probe transcript row by row, and it is a JS timer
 * that no reduced-motion block can cancel — it opts out by reading
 * `matchMedia` itself. Under the preference this gate asserts, `pause()`
 * resolves immediately, which is a real behavioural difference and exactly the
 * rendering being measured.
 *
 * `aria-hidden` subtrees are excluded. On this page that is a closed set: the
 * ✓/🔒 glyph in each subscriber cell and the ·/🔑/🚫/✕ glyph on each tree leaf
 * button (each sits beside its own words AND is repeated in the button's
 * `aria-label`), the `.probe-cells` strip, and the histogram bars. The last two
 * are NOT decorative and are measured on purpose by `auditGraphics` below,
 * precisely because both oracles stop at the attribute.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. A renderer that throws halfway through leaves an earlier state on
 * screen, and a gate that scans that state reports green for a page that is
 * broken. That matters here because every panel renders by building a DOM tree
 * and appending it in one go: a throw partway through `renderStep` leaves the
 * PREVIOUS step on screen, and the drive's own `expect`s would be the only
 * thing that noticed. Attach before `boot`, assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark: the shared bar.
 *
 * This page has two `<header>` elements — the shared `.cl-topbar`, which
 * declares `role="banner"`, and `.cl-hero`, which sits INSIDE `<main id="app">`
 * and is therefore scoped out of the banner role by the markup rather than by
 * `index.html`'s `dedupeBanner()`. Asserting the OUTCOME rather than either
 * mechanism means a change to the nesting is caught too.
 * Being scoped by `<main>` strips the hero's implicit banner role on its own,
 * and `index.html`'s `dedupeBanner()` also skips it for that reason
 * (`el.closest('main, …')` returns early). Asserting the OUTCOME rather than
 * either mechanism means a change to the nesting is caught too.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page — including the
 * lab's DEFAULTS, which are never assumed.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page. It matters more here than in most labs:
 * `dom.ts`'s `pause()` reads `matchMedia('(prefers-reduced-motion: reduce)')`
 * ITSELF and returns an already-resolved promise when the preference is set, so
 * the preference changes the lab's own control flow, not just its painting. The
 * probe transcript is staged at 420ms a row without it and instantaneous with
 * it, and only one of those is a rendering a gate can assert exact ratios about.
 *
 * The theme is seeded through `localStorage` rather than by clicking the
 * toggle, which also pins a real failure mode: `index.html`'s anti-flash script
 * reads `localStorage.getItem('theme')` and the shared bar's toggle writes
 * `localStorage.setItem('theme', …)`. If those keys drift apart the theme
 * silently stops persisting.
 *
 * THE VIEWPORT IS SET EXPLICITLY BY THE SPEC, not inherited from the project.
 * `playwright.config.ts` defines a `mobile-chromium` project at 390x844 with
 * `isMobile: true`, so a test that relied on the project's viewport would run
 * its "1280" configuration at 390px and label it wrong.
 *
 * The defaults are asserted at length because this lab ships with a SCENARIO
 * ALREADY LOADED and reads it from the URL hash. Nobody is revoked, the cover
 * method is `sd`, no subscriber is selected, subscriber #12 is pre-ticked as the
 * traitor so one click builds a decoder, the collusion pair is #4/#13, and the
 * strategy radio ships on `evasive` — which is the branch where the tracing
 * guarantee FAILS. That last one is the "ships with its cheat toggles on" shape
 * from this sweep: a gate that scanned one configuration would have been
 * scanning the failing branch and never the sound one, or the reverse, and
 * which half depends entirely on a default nobody wrote down.
 */
export async function boot(page: Page, theme: 'dark' | 'light', viewport: { width: number; height: number }): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful. 20s turns that silent hang into a
  // named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.setViewportSize(viewport);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await assertSingleBanner(page);

  // Every exhibit is mounted by an async `main()` that first derives sixteen key
  // rings with real HKDF and HMAC, so a navigation that resolves proves nothing.
  // The last cell of Exhibit 2's decoder grid is the completion signal.
  await expect(page.locator('#sub-cell-15')).toBeVisible({ timeout: 60_000 });
  for (const id of ['naive-app', 'cover-app', 'trace-app', 'collusion-app']) {
    await expect(page.locator(`#${id}`)).not.toBeEmpty();
  }

  // The lab's own reduced-motion block, asserted rather than assumed: it cancels
  // every transition on the page, and `.tree-svg .edge` declares one.
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector('.tree-svg .edge')!).transitionDuration),
    "the lab's own reduced-motion block must cancel the tree transitions"
  ).toBe('0s');

  // ── Every shipped default ────────────────────────────────────────────────
  await expect(page.locator('#method-sd')).toBeChecked();
  await expect(page.locator('#method-cs')).not.toBeChecked();
  await expect(page.locator('#cover-msg')).toHaveValue('This month’s licensed-content session key is inside.');
  // Nobody revoked: sixteen cells, all decrypting.
  await expect(page.locator('.sub-cell.is-ok')).toHaveCount(16);
  await expect(page.locator('.sub-cell.is-locked')).toHaveCount(0);
  await expect(page.locator('#stat-sd')).toHaveText('1');
  await expect(page.locator('#stat-cs')).toHaveText('1');
  await expect(page.locator('#stat-naive')).toHaveText('16');
  await expect(page.locator('#sub-detail')).toContainText('Pick a subscriber above');
  // The traitor picker ships with exactly one box ticked — #12 — which is what
  // makes "Build the pirate decoder" a valid first click.
  await expect(page.locator('#traitor-11')).toBeChecked();
  await expect(page.locator('.trait-checks input:checked')).toHaveCount(1);
  await expect(page.locator('#run-trace')).toBeDisabled();
  // Exhibit 4's defaults, including the strategy radio.
  await expect(page.locator('#collusion-a')).toHaveValue('3');
  await expect(page.locator('#collusion-b')).toHaveValue('12');
  await expect(page.locator('#strat-evasive')).toBeChecked();
  await expect(page.locator('#strat-greedy')).not.toBeChecked();
  await expect(page.locator('#collusion-seed')).toHaveValue(/^\d+$/);
  // Exhibit 1 ships un-revoked.
  await expect(page.locator('#naive-revoke')).toHaveText('Revoke subscriber #7');

  // Six disclosures, all shut.
  await expect(page.locator('#app details')).toHaveCount(6);
  await expect(page.locator('#app details[open]')).toHaveCount(0);

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and the spec this
 * replaces never rendered a narrow viewport in the a11y run, so the whole phone
 * column was unmeasured. This page is full of the shapes that break it: the
 * tree, whose `.tree-inner` declares `min-width: 640px` outright and is meant to
 * scroll inside `.tree-scroll`; `.probe-cells`, sixteen 1.05rem cells in an
 * `inline-grid` with no wrap; `.subscriber-grid` and `.trait-checks`, both
 * eight columns dropping to four below 640px; `.entry-bar`, a `white-space:
 * nowrap` line of hex; `.hist-bar`, whose inline `width` is set in `rem` from a
 * count; and `.naive-grid`, `repeat(auto-fit, minmax(17rem, 1fr))`. The
 * assertion here is that none of them scrolls the DOCUMENT.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow-x: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. That cost
    // a run elsewhere in this fleet, and this page has a decoy behind every
    // `.scroll-x`.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1). If
 * it holds no focusable content it needs `tabindex="0"`, so it becomes a focus
 * target arrow keys can then scroll.
 *
 * This lab has exactly one scrolling container, and it is the most important
 * thing on the page: `.tree-scroll`, which holds the subscriber tree at a
 * declared `min-width: 640px` and so overflows at every phone width and at some
 * desktop ones. It carries `tabindex="0"`, `role="region"` and an `aria-label`.
 * The assertion stays because that is one hand-written attribute set on one
 * element, and because the tree is where the entire subset-cover argument is
 * made — a reader who cannot scroll it cannot see which subsets cover which
 * leaves.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * SC 1.4.11 (non-text contrast) for interactive controls: a control's boundary
 * has to be perceivable against what surrounds it.
 *
 * The spec this replaces had NO 1.4.11 check at all — but `style.css` did, in
 * prose. The `--border-strong` token carries a comment stating the exact
 * problem ("Those controls are filled with --bg-inset, which sits 1.03:1 from
 * the panel behind them — the border is the only thing that makes the control
 * visible, and WCAG 2.1 SC 1.4.11 requires 3:1. --border measured 1.70:1 at
 * best / 1.56:1 at worst") and then scopes the fix to
 * "(#app select, #app input[type=text])" — the two selectors it is applied to,
 * out of the twenty-three places `--border` is used. `#app button` is
 * `--bg-inset` on `--bg-panel` with a `--border` edge: the SAME 1.03:1 fill and
 * the SAME 1.70:1 border the comment describes, on every button on the page. A
 * comment is not a check, and a check pointed only where a rule is already kept
 * is the same as not having one.
 *
 * A control passes if EITHER
 *   - its fill differs from the surface behind it, or
 *   - it has a border that stands out from the surface behind it AND from its
 *     own fill (how `#app select` works: a `--bg-inset` fill with a drawn
 *     `--border-strong` edge).
 * so the score is `max(fill-vs-outside, min(border-vs-outside, border-vs-fill))`.
 * Taking the max of the two mechanisms is what keeps this from failing a
 * perfectly delineated solid button for having no border.
 *
 * Two deliberate exclusions:
 *  - `disabled` controls. WCAG exempts inactive components, and this page ships
 *    "Run the trace" disabled until a decoder exists, and disables both trace
 *    buttons while a trace runs — states the drive builds and scans
 *    deliberately rather than skipping.
 *  - anything outside `#app`. The shared top bar is not this lab's to change —
 *    every repo in the fleet carries a byte-identical copy — and its `.cl-btn`
 *    boundary is measured, ratcheted and reported by `nontext.ts` instead, which
 *    walks the whole document. Stated here so the exclusion is a decision rather
 *    than an oversight.
 */
export async function auditControlBoundaries(
  page: Page
): Promise<Array<{ sel: string; ratio: number }>> {
  return page.evaluate(() => {
    type C = { r: number; g: number; b: number; a: number };
    // Resolve through a canvas rather than a regex: this palette reaches for
    // `color-mix()` wherever a tint is wanted — `.entry-bar`
    // (`color-mix(in oklab, var(--accent) 18%, var(--bg-panel))`), the tree's
    // `.region` fill and stroke, `.node.cover circle` — and `getComputedStyle`
    // hands several of those back unresolved. A regex reads them as null and
    // lands the walk on the wrong backdrop.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const parse = (s: string): C => {
      if (!s) return { r: 0, g: 0, b: 0, a: 0 };
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = s;
      const a = ctx.fillStyle;
      ctx.fillStyle = '#fff';
      ctx.fillStyle = s;
      if (a !== ctx.fillStyle) return { r: 0, g: 0, b: 0, a: 0 };
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0]!, g: d[1]!, b: d[2]!, a: d[3]! / 255 };
    };
    const over = (fg: C, bg: C): C => {
      const a = fg.a + bg.a * (1 - fg.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
        g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
        b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
        a,
      };
    };
    const lum = (c: C): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: C, b: C): number => {
      const la = lum(a);
      const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const backdrop = (start: Element | null): C => {
      const stack: C[] = [];
      for (let n = start; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0) {
          stack.push(c);
          if (c.a >= 1) break;
        }
      }
      let out: C = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i]!, out);
      return out;
    };
    const describe = (el: Element): string => {
      const cls = el.getAttribute('class');
      return (
        el.tagName.toLowerCase() +
        (el.id ? `#${el.id}` : '') +
        (cls ? `.${cls.trim().split(/\s+/).join('.')}` : '')
      );
    };

    const out: Array<{ sel: string; ratio: number }> = [];
    const app = document.getElementById('app');
    if (!app) return out;
    app
      .querySelectorAll<HTMLElement>(
        "button, select, textarea, input[type='text'], input[type='number']"
      )
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if ((el as HTMLButtonElement).disabled) return;
        if (el.closest('[hidden]')) return;
        const cs = getComputedStyle(el);
        const outside = backdrop(el.parentElement);
        const fillRaw = parse(cs.backgroundColor);
        const fill = fillRaw.a > 0 ? over(fillRaw, outside) : outside;
        const byFill = ratio(fill, outside);
        let byBorder = 1;
        if (parseFloat(cs.borderTopWidth) > 0) {
          const border = over(parse(cs.borderTopColor), fill);
          byBorder = Math.min(ratio(border, outside), ratio(border, fill));
        }
        out.push({
          sel: describe(el),
          ratio: Math.round(Math.max(byFill, byBorder) * 100) / 100,
        });
      });
    return out;
  });
}



/**
 * SC 1.4.11 for the graphics BOTH oracles are blind to.
 *
 * This lab argues almost entirely in pictures, and three of them are outside
 * every other check here. `contrast.ts` walks text nodes; `nontext.ts`'s control
 * list is interactive roles; axe has no non-text rule at all; and two of these
 * three sit inside `aria-hidden` subtrees, which is where BOTH arithmetic
 * oracles stop by design. So they are measured directly:
 *
 *  - THE SUBSET-COVER TREE. `.tree-svg .node circle` is a `--bg-panel` fill with
 *    a `--border` stroke, and `.node.cover circle` swaps to an `--accent-strong`
 *    stroke: WHICH NODES ARE COVER-SET ROOTS is the whole of Exhibit 2, and the
 *    stroke is what says so. `.edge.hot` is the membership chain a selected
 *    subscriber lights up. `.region` is the tinted block marking one cover
 *    subset, and `.region-cut` the dashed carve-out that is the entire
 *    difference between subset difference and complete subtree.
 *  - THE PROBE STRIP. `.probe-cell` vs `.probe-cell.dud` vs `.probe-cell.gone`
 *    is the box's-eye view of one probe — who got a real key, who got a dud, who
 *    is revoked. It is `aria-hidden` with a prose count beside it, which is
 *    right, and it is still a graphic a sighted reader is asked to read.
 *  - THE COLLUSION HISTOGRAM. `.hist-bar` against `.hist-row.innocent .hist-bar`
 *    is the punchline of Exhibit 4: how often the tracer accuses an innocent
 *    subscriber. Also `aria-hidden`, with the count printed beside it.
 *
 * Each is measured against the surface it is actually painted on, and only the
 * parts required to understand the content are included. A purely decorative
 * rule is not a 1.4.11 case, and inventing failures for one would make this list
 * less trustworthy rather than more.
 */
export async function auditGraphics(
  page: Page
): Promise<Array<{ what: string; ratio: number }>> {
  return page.evaluate(() => {
    type C = { r: number; g: number; b: number; a: number };
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const parse = (s: string): C => {
      if (!s) return { r: 0, g: 0, b: 0, a: 0 };
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = s;
      const a = ctx.fillStyle;
      ctx.fillStyle = '#fff';
      ctx.fillStyle = s;
      if (a !== ctx.fillStyle) return { r: 0, g: 0, b: 0, a: 0 };
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0]!, g: d[1]!, b: d[2]!, a: d[3]! / 255 };
    };
    const over = (fg: C, bg: C): C => {
      const a = fg.a + bg.a * (1 - fg.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
        g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
        b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
        a,
      };
    };
    const lum = (c: C): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: C, b: C): number => {
      const la = lum(a);
      const lb = lum(b);
      return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
    };
    const backdrop = (start: Element | null): C => {
      const stack: C[] = [];
      for (let n = start; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0) {
          stack.push(c);
          if (c.a >= 1) break;
        }
      }
      let out: C = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i]!, out);
      return out;
    };
    /** An SVG shape's stroke, composited over what it is drawn on. */
    const strokeOn = (el: Element | null, surface: C): C | null => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const raw = parse(cs.stroke);
      if (raw.a <= 0) return null;
      const op = parseFloat(cs.strokeOpacity || '1');
      return over({ ...raw, a: raw.a * (Number.isFinite(op) ? op : 1) }, surface);
    };
    /** An HTML box's own background, composited over what it sits on. */
    const boxFillOn = (el: Element | null, surface: C): C | null => {
      if (!el) return null;
      const raw = parse(getComputedStyle(el).backgroundColor);
      if (raw.a <= 0) return null;
      return over(raw, surface);
    };

    const out: Array<{ what: string; ratio: number }> = [];
    const push = (what: string, c: C | null, bg: C): void => {
      if (c) out.push({ what, ratio: ratio(c, bg) });
    };

    // ── the subset-cover tree ───────────────────────────────────────────────
    const scroll = document.querySelector('.tree-scroll');
    if (scroll) {
      const surface = backdrop(scroll);
      push(
        'tree node outline vs the tree surface',
        strokeOn(document.querySelector('.tree-svg .node:not(.cover):not(.excluded) circle'), surface),
        surface
      );
      push(
        'COVER node outline vs the tree surface',
        strokeOn(document.querySelector('.tree-svg .node.cover circle'), surface),
        surface
      );
      push(
        'EXCLUDED node outline vs the tree surface',
        strokeOn(document.querySelector('.tree-svg .node.excluded circle'), surface),
        surface
      );
      push('tree edge vs the tree surface', strokeOn(document.querySelector('.tree-svg .edge:not(.hot)'), surface), surface);
      push('HIGHLIGHTED edge vs the tree surface', strokeOn(document.querySelector('.tree-svg .edge.hot'), surface), surface);
      const region = document.querySelector('.tree-svg .region');
      if (region) {
        // The cover subset is delineated by EITHER its tint or its outline, and
        // 1.4.11 asks that the block be perceivable, not that both halves of it
        // clear 3:1 independently — the same either/or the control-boundary
        // oracle applies to a fill and its border. Judging them separately would
        // demand a 3:1 wash behind the node labels drawn on top of it, which
        // would trade this criterion against 1.4.3 for no gain. Both raw numbers
        // stay in the label so a regression says which half moved.
        const rcs = getComputedStyle(region);
        const rfill = parse(rcs.fill);
        const op = parseFloat(rcs.fillOpacity || '1');
        const filled = over({ ...rfill, a: rfill.a * (Number.isFinite(op) ? op : 1) }, surface);
        const tintRatio = ratio(filled, surface);
        const stroke = strokeOn(region, surface);
        const strokeRatio = stroke ? ratio(stroke, surface) : 1;
        out.push({
          what: `cover-subset block vs the tree surface (tint ${tintRatio}:1, outline ${strokeRatio}:1)`,
          ratio: Math.max(tintRatio, strokeRatio),
        });
      }
      push(
        'carved-out subset outline (subset difference) vs the tree surface',
        strokeOn(document.querySelector('.tree-svg .region-cut'), surface),
        surface
      );
    }

    // ── the probe strip ─────────────────────────────────────────────────────
    //
    // What is measured here is the GLYPH, not the fill, and that is a
    // correction rather than a softening. A real-key cell and a dud cell differ
    // by only 1.20:1 in background — but the tint is not what tells them apart.
    // Each cell carries a letter ("k" for a real key, "d" for a dud, "·" for a
    // revoked subscriber) and the dud draws its edge dashed where the real one
    // draws it solid, so the distinction is a glyph plus a border style, with
    // the tint as redundant reinforcement. Demanding 3:1 between the two fills
    // would be asking the design to carry the meaning a second way it does not
    // claim to.
    //
    // The glyph is the cue that exists, and it is in the shared blind spot:
    // `.probe-cells` is `aria-hidden`, so `contrast.ts` skips its text and
    // axe's `color-contrast` rule skips it too. Nothing else on this page
    // measures it.
    for (const [sel, what] of [
      ['.probe-cell:not(.dud):not(.gone)', 'probe cell "k" glyph (real key) vs its own fill'],
      ['.probe-cell.dud', 'probe cell "d" glyph (dud key) vs its own fill'],
      ['.probe-cell.gone', 'probe cell "·" glyph (revoked) vs its own fill'],
    ] as Array<[string, string]>) {
      const cell = document.querySelector(sel);
      if (!cell) continue;
      const surface = backdrop(cell.parentElement);
      const fill = boxFillOn(cell, surface) ?? surface;
      const ink = parse(getComputedStyle(cell).color);
      if (ink.a > 0) out.push({ what, ratio: ratio(over(ink, fill), fill) });
    }
    const realCell = document.querySelector('.probe-cell:not(.dud):not(.gone)');
    if (realCell) {
      const surface = backdrop(realCell.parentElement);
      push('probe cell outline vs the row behind it', strokeOn(realCell, surface), surface);
    }

    // ── the collusion histogram ─────────────────────────────────────────────
    //
    // Each bar is measured against the PANEL, because seeing where a bar ends
    // is what reading its length means. The traitor and innocent bars are NOT
    // measured against each other: they are told apart by the label beside
    // them ("#4 (traitor)" / "#13 (INNOCENT ⚠)") and by the count printed after
    // them, so the colour is redundant reinforcement rather than the carrier,
    // and a 3:1 requirement between two saturated hues would be a criterion
    // this design does not need to meet.
    for (const [sel, what] of [
      ['.hist-row:not(.innocent) .hist-bar', 'histogram bar (traitor) vs the panel behind it'],
      ['.hist-row.innocent .hist-bar', 'histogram bar (innocent) vs the panel behind it'],
    ] as Array<[string, string]>) {
      const bar = document.querySelector(sel);
      if (!bar) continue;
      const surface = backdrop(bar.parentElement);
      push(what, boxFillOn(bar, surface), surface);
    }
    return out;
  });
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run. It
 * is a debugging aid only: `A11Y_COLLECT` is never set in CI or in the committed
 * workflow, and a run with it set prints every finding as it happens and then
 * fails at the end, so a green collection run cannot be mistaken for a green
 * gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function expectScrollersReachableSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectScrollersReachable(page, label);
  try {
    await expectScrollersReachable(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

/**
 * The 1.4.11 ratchet, soft-wrapped the same way as every other oracle here.
 *
 * IT IS CALLED FROM `scan()`, not from inside another oracle's soft wrapper.
 * Fleet-wide, `expectNoNewNonTextFailures` was called from the body of
 * `expectScrollersReachableSoft`, AFTER that function's
 * `if (!COLLECTING) return …` guard — so in a strict run, which is every run in
 * CI and every run anyone reads as a pass, the guard returned first and
 * `nontext.ts` never executed at all. Thirteen repos certified themselves clean
 * against a baseline captured while nothing had ever looked.
 */
async function expectNoNewNonTextFailuresSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectNoNewNonTextFailures(page, label);
  try {
    await expectNoNewNonTextFailures(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

async function expectNoHorizontalOverflowSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectNoHorizontalOverflow(page, label);
  try {
    await expectNoHorizontalOverflow(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node.
 *
 * `style.css` declares no `content` property, so the generated-content half has
 * nothing to find today; it runs at every state anyway, so the first one added
 * is measured on the day it lands — including the day someone replaces
 * `details.expert > summary`'s user-agent marker with a `::before` glyph.
 *
 * The backlog is real, so this does not block on it — but a check that merely
 * logs is not a gate. So it ratchets: anything NOT in the baseline fails,
 * anything in the baseline that got WORSE fails, and anything in the baseline
 * that has been FIXED fails until its entry is deleted. That last rule is what
 * stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it. Opt-in via env, and the run is
  // deliberately left failing at the end by `expectBaselineNotStale` so a
  // capture pass can never be mistaken for a passing gate.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(
        `WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`
      );
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Eight assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. Everything else in that bucket is a real result axe
 *    simply could not finish — including `aria-prohibited-attr`, which is where
 *    an `aria-label` on a role-less element hides, a defect that never reaches
 *    the violations array at all. Every `aria-label` on this page was checked
 *    rather than assumed: each is on an element that carries a role, or on an
 *    `<ol>`/`<button>` whose implicit role permits naming.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node,
 *    which matters here because every verdict lands in a `.verdict-card` on
 *    `--bg-inset` inside a `--bg-panel` panel, and `.entry-bar` is a
 *    `color-mix(in oklab, var(--accent) 18%, var(--bg-panel))` that axe files
 *    under `incomplete`.
 *  - non-text contrast for interactive controls — SC 1.4.11.
 *  - the tree, the probe strip and the collusion histogram — SC 1.4.11 for
 *    graphics, two of them inside `aria-hidden` subtrees, which is the one place
 *    BOTH other oracles stop by design.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])` axe therefore runs those
  // FOUR best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. `withTags(TAGS)` selects 69 of axe-core
  // 4.12's 105 rule definitions; the chained form executes 4.
  //
  // Running the two sets separately and merging is the only way to have both.
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them, and this page has
  // the shape they catch: a shared sticky `<header role="banner">` above a
  // `<main>` that contains a second `<header>`, with the hero's
  // `<aside role="complementary">` inside it.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  const boundaries = await auditControlBoundaries(page);
  expect(boundaries.length, `no controls found to measure in state: ${label}`).toBeGreaterThan(0);
  const undelineated = Array.from(
    new Set(boundaries.filter((b) => b.ratio < 3).map((b) => `${b.ratio}:1 ${b.sel}`))
  );
  softExpect(undelineated, `control boundaries under 3:1 (SC 1.4.11) in state: ${label}`, []);

  const graphics = await auditGraphics(page);
  // A liveness floor, so a zero result cannot read as a clean one — which is the
  // failure mode this whole sweep exists to remove. TWO, not more: the tree's
  // node outline and its edges are on the page in every state, but the
  // cover-subset block is NOT — when every subscriber is revoked the cover is
  // empty and no `.region` rect is drawn at all, and that is a state this drive
  // deliberately builds. The probe strip and the histogram likewise only exist
  // after their exhibits have been run.
  expect(graphics.length, `the tree must be measurable in state: ${label}`).toBeGreaterThanOrEqual(2);
  const dimGraphics = graphics.filter((m) => m.ratio < 3).map((m) => `${m.ratio}:1 ${m.what}`);
  softExpect(dimGraphics, `graphics under 3:1 (SC 1.4.11) in state: ${label}`, []);

  await expectNoNewNonTextFailuresSoft(page, label);
  await expectScrollersReachableSoft(page, label);
  await expectNoHorizontalOverflowSoft(page, label);
}



// ── The drive ───────────────────────────────────────────────────────────────

/**
 * Open one shut disclosure by clicking its summary, and assert it opened.
 *
 * The disclosure is located by its own summary text rather than by a
 * `:not([open])` selector, because that selector stops matching the instant the
 * click succeeds and the post-condition would then be asserted against nothing.
 * Shut-ness is asserted first, as a precondition, so this cannot silently pass
 * on an already-open element — and it is a click, not `d.open = true`, which is
 * what the spec this replaces did to all six at once.
 */
async function openDetails(page: Page, summaryText: string | RegExp): Promise<void> {
  const details = page
    .locator('#app details')
    .filter({ has: page.locator('summary', { hasText: summaryText }) })
    .first();
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').first().click();
  await expect(details).toHaveAttribute('open', '');
}

/** Open every VISIBLE shut disclosure by clicking its own summary. */
async function openAllDisclosures(page: Page, expectSome = true): Promise<void> {
  const shut = page.locator('#app details:not([open]) > summary:visible');
  let opened = 0;
  for (let i = await shut.count(); i > 0 && opened < 40; i = await shut.count()) {
    await shut.first().click();
    opened += 1;
  }
  await expect(page.locator('#app details:not([open]) > summary:visible')).toHaveCount(0);
  if (expectSome) {
    expect(opened, 'no shut disclosure was found where one was expected').toBeGreaterThan(0);
  }
}

/**
 * Drive the lab through every state that renders a verdict, scanning each.
 *
 * Seven things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, AND IT IS ALREADY RUNNING. Nothing
 *    ships empty here: Exhibit 2 has already computed a cover, encrypted a real
 *    broadcast and tested all sixteen decoders against it before first paint.
 *    That is the page a reader meets and the old spec went straight past it.
 *
 *  - EVERY STATE IS SCANNED WHILE IT IS ON SCREEN. The spec this replaces ran a
 *    fourteen-step drive across all four exhibits and then called `scan()`
 *    ONCE, at the end — by which time `clear()` had replaced Exhibit 2's cover
 *    status, header list and detail box four times over, and Exhibit 3's probe
 *    transcript had been wiped and rebuilt. Everything it built was gone before
 *    anything measured it.
 *
 *  - THE PROBE TRANSCRIPT IS SCANNED WHILE IT IS BEING WRITTEN. `renderStep`
 *    appends one `.probe-row` per probe and `dom.ts`'s `pause(420)` spaces them
 *    out — except under the reduced-motion preference this gate asserts, where
 *    `pause()` returns immediately. Both the partial and the finished transcript
 *    are real renderings; the drive scans the finished one and asserts the row
 *    count, which is the completion signal the code itself defines.
 *
 *  - BOTH COVER METHODS, AT SEVERAL REVOCATION SIZES. Complete subtree and
 *    subset difference draw DIFFERENT tree graphics — CS has no `.region-cut`
 *    at all, because carving a subset out is the thing SD adds — so a gate that
 *    scanned one method never rendered the other's dashed carve-out. Both are
 *    driven, at zero, two and many revocations, including the everyone-revoked
 *    edge case where the header is empty and nobody can decrypt.
 *
 *  - EVERY EMPTY AND ERROR STATE. An empty decoder (no traitor ticked), a
 *    collusion pair with both selects on the same subscriber (twice: once for
 *    the probe view, once for the histogram), and the everyone-revoked cover.
 *    Each renders a `verdict-card is-warn` that no default-state gate reaches.
 *
 *  - BOTH DECODER STRATEGIES. The lab ships on `evasive`, which is the branch
 *    where the tracing guarantee FAILS and innocent subscribers get accused —
 *    so `greedy`, the branch where it holds, is the one a single-configuration
 *    gate would never have seen. Both histograms are built and scanned.
 *
 *  - NO FIXED TIMEOUTS. Every exhibit is real WebCrypto, and every one has a DOM
 *    completion signal: a cell count, a header-list length, a verdict card, a
 *    histogram row, a button returning from `disabled`. The drive waits on
 *    those. The spec this replaces ended with `waitForTimeout(300)`.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  await scanAt('first paint: nobody revoked, one cover subset, all sixteen decoding');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('skip link focused');

  await openDetails(page, "What's real here, what's scaled down");
  await scanAt('the scope disclosure open');

  // ── Exhibit 1: the naive baselines ───────────────────────────────────────
  await page.locator('#naive-revoke').click();
  await expect(page.locator('#naive-app')).toContainText('15 of 15 remaining subscribers');
  await expect(page.locator('#naive-app .entry-bar')).not.toHaveCount(0);
  await scanAt('Exhibit 1: the rekey storm, 15 real wraps reissued');

  await page.locator('#naive-revoke').click();
  await expect(page.locator('#naive-revoke')).toHaveText('Revoke subscriber #7');
  await scanAt('Exhibit 1 restored: the shared-group-key baseline again');

  // ── Exhibit 2: the subset cover ──────────────────────────────────────────
  await page.locator('#cover-preset').click();
  await expect(page.locator('#stat-sd')).toHaveText('2');
  await expect(page.locator('#stat-cs')).toHaveText('6');
  await expect(page.locator('#stat-naive')).toHaveText('14');
  await expect(page.locator('.sub-cell.is-locked')).toHaveCount(2);
  await expect(page.locator('#cover-app .header-list li')).toHaveCount(2);
  await scanAt('Exhibit 2: #7 and #12 revoked, subset difference, 2 header entries');

  // A revoked subscriber: a real GCM authentication failure, and the LOCKED OUT
  // verdict rendered separately from it.
  await page.locator('#sub-cell-6').click();
  await expect(page.locator('#sub-detail')).toContainText('LOCKED OUT — revocation holding');
  await expect(page.locator('#sub-detail')).toContainText('authentication tag rejected it');
  await expect(page.locator('.tree-svg .edge.hot')).toHaveCount(0);
  await scanAt('a revoked subscriber inspected: no covering subset, tag rejected');

  // An authorized one: this is the only state that lights the membership chain
  // on the tree, which is what `auditGraphics` measures `.edge.hot` in.
  await page.locator('#sub-cell-0').click();
  await expect(page.locator('#sub-detail')).toContainText('AUTHORIZED — decryption succeeded');
  await expect(page.locator('#sub-detail')).toContainText('byte-for-byte identical');
  await expect(page.locator('.tree-svg .edge.hot')).not.toHaveCount(0);
  await scanAt('an authorized subscriber inspected, its membership chain lit');

  // Complete subtree draws a different cover and NO carve-out at all.
  await page.locator('#method-cs').check();
  await expect(page.locator('#cover-app .header-list li')).toHaveCount(6);
  await expect(page.locator('.tree-svg .region-cut')).toHaveCount(0);
  await scanAt('Exhibit 2 on complete subtree: six entries, no carve-outs');

  await page.locator('#method-sd').check();
  await expect(page.locator('#cover-app .header-list li')).toHaveCount(2);
  await expect(page.locator('.tree-svg .region-cut')).not.toHaveCount(0);
  await scanAt('back to subset difference: the dashed carve-out returns');

  // Revoking by clicking the tree itself — the control the panel is named for,
  // and an `aria-pressed` toggle whose state the drive asserts.
  await expect(page.locator('#tt-leaf-2')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#tt-leaf-2').click();
  await expect(page.locator('#tt-leaf-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sub-cell.is-locked')).toHaveCount(3);
  await scanAt('a third subscriber revoked by clicking its leaf on the tree');

  // The message field: the payload really is re-encrypted under a new session key.
  await page.locator('#cover-msg').fill('a different broadcast, re-encrypted for real');
  await page.locator('#cover-msg').blur();
  await expect(page.locator('#sub-detail')).toContainText('a different broadcast, re-encrypted for real');
  await scanAt('the broadcast message changed and the payload re-encrypted');

  // The scenario-link control, whose confirmation lands in an aria-live status.
  await page.locator('#copy-scenario').click();
  await expect(page.locator('.copy-status')).not.toBeEmpty();
  await scanAt('the scenario link copied, confirmation announced');

  // The edge case: everyone revoked. An empty header, sixteen locked cells, and
  // a cover the algorithm reports as empty.
  for (let u = 0; u < 16; u++) {
    const pressed = await page.locator(`#tt-leaf-${u}`).getAttribute('aria-pressed');
    if (pressed !== 'true') await page.locator(`#tt-leaf-${u}`).click();
  }
  await expect(page.locator('.sub-cell.is-locked')).toHaveCount(16);
  await expect(page.locator('#cover-app')).toContainText('everyone is revoked');
  await scanAt('every subscriber revoked: an empty header, nobody decrypts');

  await page.locator('#cover-clear').click();
  await expect(page.locator('.sub-cell.is-ok')).toHaveCount(16);
  await expect(page.locator('#stat-sd')).toHaveText('1');
  await scanAt('everyone restored, back to one cover subset');

  await openDetails(page, 'Where the keys come from');
  await openDetails(page, 'Why the SD cover needs at most 2r−1 wraps');
  await scanAt('two of Exhibit 2’s expert disclosures open');

  // ── Exhibit 3: build a decoder and trace it ──────────────────────────────
  // The empty box first: a warn card, and "Run the trace" left disabled.
  await page.locator('#traitor-11').uncheck();
  await expect(page.locator('.trait-checks input:checked')).toHaveCount(0);
  await page.locator('#build-decoder').click();
  await expect(page.locator('#trace-app')).toContainText('an empty box');
  await expect(page.locator('#run-trace')).toBeDisabled();
  await scanAt('Exhibit 3: an empty decoder — nothing to trace, trace disabled');

  await page.locator('#traitor-11').check();
  await page.locator('#build-decoder').click();
  await expect(page.locator('#trace-app')).toContainText('A pirate decoder appears');
  await expect(page.locator('#trace-app')).toContainText('BREACH');
  await expect(page.locator('#run-trace')).toBeEnabled();
  await scanAt('a pirate decoder built from #12’s keys: real decryption, BREACH');

  await page.locator('#run-trace').click();
  await expect(page.locator('#trace-app')).toContainText('The accusation', { timeout: 120_000 });
  await expect(page.locator('.probe-row')).not.toHaveCount(0);
  await expect(page.locator('#trace-app')).toContainText('CORRECT — you did copy');
  await scanAt('the trace finished: probe transcript written, accusation correct');

  await page.locator('#revoke-accused').click();
  await expect(page.locator('#trace-app')).toContainText('After revoking', { timeout: 120_000 });
  await expect(page.locator('#trace-app')).toContainText('the box is dead');
  await scanAt('trace-and-revoke complete: the box decrypts nothing');

  // Two traitors: the same tracer, now with a coalition inside the box.
  await page.locator('#traitor-3').check();
  await page.locator('#build-decoder').click();
  await expect(page.locator('#trace-app')).toContainText('2 key sets inside');
  await scanAt('a two-key-set decoder built: the coalition case');

  await page.locator('#run-trace').click();
  await expect(page.locator('#trace-app')).toContainText('The accusation', { timeout: 120_000 });
  await scanAt('the coalition box traced');

  await openDetails(page, 'Why a lone decoder cannot dodge this');
  await scanAt('Exhibit 3’s expert disclosure open');

  // ── Exhibit 4: the honest limit ──────────────────────────────────────────
  await page.locator('#pool-revoked').click();
  await expect(page.locator('#collusion-app')).toContainText('HOLDING', { timeout: 120_000 });
  await scanAt('Exhibit 4: pooled REVOKED keys still open nothing');

  // Both selects on the same subscriber — the rejected setup, twice, because
  // the two buttons render it into two different boxes.
  await page.locator('#collusion-b').selectOption('3');
  await page.locator('#peek-probe').click();
  await expect(page.locator('#peek-box')).toContainText('pick two different subscribers first');
  await scanAt('the probe view refused a one-subscriber “coalition”');

  await page.locator('#run-collusion').click();
  await expect(page.locator('#collusion-app')).toContainText('one traitor is Exhibit 3’s case');
  await scanAt('the histogram refused a one-subscriber “coalition”');

  await page.locator('#collusion-b').selectOption('12');
  await page.locator('#peek-probe').click();
  await expect(page.locator('#peek-box')).toContainText('its own two entries disagree', { timeout: 120_000 });
  // Two `resultLine`s, one per key set, plus the comparison and the lone-box
  // contrast — the peek view renders prose, not probe cells, so the transcript
  // Exhibit 3 left on the page is untouched and is not what this asserts on.
  await expect(page.locator('#peek-box .result-line')).toHaveCount(4);
  await scanAt('the box’s-eye view of one probe: the detectable disagreement');

  // A fixed seed so the histogram is identical in every configuration — a
  // reproducible rendering is the only kind exact ratios can be asserted about.
  await page.locator('#collusion-seed').fill('123456');
  await page.locator('#run-collusion').click();
  await expect(page.locator('.hist-row').first()).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('#collusion-app')).toContainText('25 independent traces');
  await scanAt('Exhibit 4: 25 evasive traces, the histogram of who got accused');

  // The other strategy — the branch where the guarantee HOLDS, which the lab
  // does not ship on and a single-configuration gate would never render.
  await page.locator('#strat-greedy').check();
  await page.locator('#run-collusion').click();
  await expect(page.locator('#collusion-app')).toContainText('greedy box', { timeout: 180_000 });
  await scanAt('Exhibit 4 on the greedy box: the guarantee holding');

  // Everything the page can render has now been rendered.
  await openAllDisclosures(page, false);
  await scanAt('the finished page with every disclosure open');
}
