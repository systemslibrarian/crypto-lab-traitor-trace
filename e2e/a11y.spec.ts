import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * Drive every exhibit into its post-interaction state before scanning: axe
 * only checks what is in the DOM, and the dynamic verdict regions are
 * exactly where contrast/live-region violations hide.
 */
async function driveDemos(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
  })
  // panels are built asynchronously after key-ring setup
  await expect(page.locator('#sub-cell-0')).toBeVisible({ timeout: 30_000 })

  // Exhibit 1: run the shared-group-key rekey storm
  await page.locator('#naive-revoke').click()
  await expect(page.locator('#naive-app .entry-bar').first()).toBeVisible()

  // Exhibit 2: preset revocation, inspect a revoked and an authorized subscriber,
  // then flip to the complete-subtree method
  await page.locator('#cover-preset').click()
  await expect(page.locator('#sub-cell-6.is-locked')).toBeVisible()
  await page.locator('#sub-cell-6').click()
  await expect(page.locator('#sub-detail .verdict-card')).toBeVisible()
  await page.locator('#sub-cell-0').click()
  await page.locator('#method-cs').check()
  await expect(page.locator('#sub-cell-0.is-ok')).toBeVisible()

  // Exhibit 3: build the decoder (default traitor #12), trace it to the
  // accusation, then run the trace-and-revoke follow-up
  await page.locator('#build-decoder').click()
  await page.locator('#run-trace').click()
  await page.locator('#revoke-accused').click({ timeout: 60_000 })
  await expect(page.locator('#trace-app .verdict-card').last()).toBeVisible()

  // Exhibit 4: pooled revoked keys, then 25 evasive traces -> histogram
  await page.locator('#pool-revoked').click()
  await page.locator('#run-collusion').click()
  await expect(page.locator('#collusion-app .hist-row').first()).toBeVisible({ timeout: 60_000 })

  // reveal all progressive-disclosure content
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => {
      d.open = true
    })
  })
  await page.waitForTimeout(300)
}

async function scan(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(
    violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
    })),
  ).toEqual([])
}

test('no WCAG A/AA violations — dark theme', async ({ page }) => {
  await page.goto('.')
  await driveDemos(page)
  await scan(page)
})

test('no WCAG A/AA violations — light theme', async ({ page }) => {
  await page.goto('.')
  await page.locator('#cl-theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await driveDemos(page)
  await scan(page)
})
