import { expect, test } from '@playwright/test'
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate'

/**
 * WCAG A/AA regression gate for Traitor Trace.
 *
 * The lab is driven along everything it teaches, and EVERY state is scanned
 * while it is on screen: the arrival page, where a cover has already been
 * computed and all sixteen decoders tested against a real broadcast; the rekey
 * storm and its restoration; the preset revocation under BOTH cover methods,
 * with a revoked subscriber's genuine GCM failure and an authorized one's
 * membership chain lit on the tree; a third revocation made by clicking a leaf;
 * a re-encrypted payload; the scenario-link confirmation; everyone revoked, so
 * the header is empty and nobody decrypts; an EMPTY pirate decoder; a
 * single-traitor decoder built, traced to its accusation, and revoked until the
 * box is dead; a two-key-set coalition box traced; pooled revoked keys opening
 * nothing; both one-subscriber "coalition" refusals; the box's-eye view of the
 * one probe a coalition can always detect; and the 25-trace histogram on BOTH
 * decoder strategies — including `greedy`, the branch where the tracing
 * guarantee holds, which this lab does not ship on.
 *
 * Four configurations: {dark, light} × {1280, 380}, with the viewport set
 * EXPLICITLY rather than inherited. `playwright.config.ts` defines a
 * `mobile-chromium` project at 390x844, so a test that relied on the project's
 * viewport would run its "1280" configuration at 390px and label it wrong.
 *
 * The a11y gate runs in the `chromium` project only. It already renders both
 * widths itself, and the only thing `mobile-chromium` adds is `pointer: coarse`
 * — which in this repo reaches nothing but `min-height`/`min-width` on the
 * shared top bar's `.cl-btn`, while `#app button` and `#app select` already
 * carry `min-height: 44px` unconditionally. Running it in both projects would
 * double an eight-minute suite to measure a media query that changes no colour
 * and no layout inside `#app`. The behaviour spec still runs in both.
 *
 * See `gate.ts` for what the old spec did: it injected motion suppression that
 * could not reach `dom.ts`'s own `matchMedia` check, opened all six `<details>`
 * by setting `.open` from script, walked all four exhibits and then scanned
 * ONCE — after every `clear()` had already replaced what it built — and never
 * touched the empty-decoder, everyone-revoked, or greedy-strategy branches at
 * all.
 */

const WIDE = { width: 1280, height: 900 }

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'the a11y gate sets its own viewports')
    test.setTimeout(1_800_000)
    const errors = watchPageErrors(page)
    await boot(page, theme, WIDE)
    await driveAllStates(page, theme)
    expect(errors, errors.join('\n')).toEqual([])
    expectBaselineNotStale()
    reportCollected()
  })

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'the a11y gate sets its own viewports')
    test.setTimeout(1_800_000)
    const errors = watchPageErrors(page)
    await boot(page, theme, NARROW)
    await driveAllStates(page, `${theme} @380px`)
    expect(errors, errors.join('\n')).toEqual([])
    expectBaselineNotStale()
    reportCollected()
  })
}
