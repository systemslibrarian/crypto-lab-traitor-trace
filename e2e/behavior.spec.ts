/**
 * Behavior regression tests for the teaching flows: the core tests prove the
 * algorithms; these prove the page faithfully RENDERS them — counts, verdict
 * labels, trace outcomes, and the reproducible collusion histogram.
 */

import { expect, test, type Page } from '@playwright/test'

async function boot(page: Page, hash = ''): Promise<void> {
  await page.goto(`.${hash}`)
  await expect(page.locator('#sub-cell-0')).toBeVisible({ timeout: 30_000 })
}

test('exhibit 1: revoking under a shared group key reissues all 15 remaining keys', async ({ page }) => {
  await boot(page)
  await page.locator('#naive-revoke').click()
  await expect(page.locator('#naive-app')).toContainText('15 of 15 remaining subscribers')
  await expect(page.locator('#naive-app')).toContainText('none — revocation is just dropping a wrap')
})

test('exhibit 2: revoke #7+#12 shows the real header numbers (SD=2, CS=6, naive=14)', async ({ page }) => {
  await boot(page)
  await page.locator('#cover-preset').click()
  await expect(page.locator('#stat-sd')).toHaveText('2')
  await expect(page.locator('#stat-cs')).toHaveText('6')
  await expect(page.locator('#stat-naive')).toHaveText('14')
  // SD is the default method: exactly 2 header entries listed
  await expect(page.locator('#cover-app .header-list li')).toHaveCount(2)
  // revoked subscriber: crypto failure + LOCKED OUT verdict, separately rendered
  await page.locator('#sub-cell-6').click()
  const detail = page.locator('#sub-detail')
  await expect(detail).toContainText('LOCKED OUT — revocation holding')
  await expect(detail).toContainText('authentication tag rejected it')
  // authorized subscriber: both-sides key comparison and AUTHORIZED verdict
  await page.locator('#sub-cell-0').click()
  await expect(detail).toContainText('byte-for-byte identical')
  await expect(detail).toContainText('AUTHORIZED — decryption succeeded')
  // flipping method updates the header list to the CS cover
  await page.locator('#method-cs').check()
  await expect(page.locator('#cover-app .header-list li')).toHaveCount(6)
})

test('exhibit 3: a decoder built from #12 is a BREACH, gets accused, and dies on revocation', async ({ page }) => {
  await boot(page)
  await page.locator('#build-decoder').click()
  await expect(page.locator('#trace-app')).toContainText('BREACH — valid decryption by a box nobody authorized')
  await page.locator('#run-trace').click()
  await expect(page.locator('#revoke-accused')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('#trace-app')).toContainText('the box holds subscriber #12’s keys')
  await expect(page.locator('#trace-app')).toContainText('CORRECT — you did copy #12’s keys')
  await page.locator('#revoke-accused').click()
  await expect(page.locator('#trace-app')).toContainText('the box is dead', { timeout: 30_000 })
  await expect(page.locator('#trace-app')).toContainText('trace-and-revoke complete')
})

test('exhibit 4: pooled revoked keys open nothing; the box can see a probe', async ({ page }) => {
  await boot(page)
  await page.locator('#pool-revoked').click()
  await expect(page.locator('#collusion-app')).toContainText('HOLDING — revoked subscribers can pool keys')
  await page.locator('#peek-probe').click()
  await expect(page.locator('#peek-box')).toContainText('session key OPENS the payload')
  await expect(page.locator('#peek-box')).toContainText('session key is a dud')
  await expect(page.locator('#peek-box')).toContainText('KNOWS this is a probe')
})

test('exhibit 4: the collusion histogram is reproducible from its seed', async ({ page }) => {
  await boot(page, '#ca=4&cb=13&st=evasive&seed=424242')
  await expect(page.locator('#collusion-seed')).toHaveValue('424242')
  await page.locator('#run-collusion').click()
  await expect(page.locator('#collusion-app .hist-row').first()).toBeVisible({ timeout: 60_000 })
  const first = await page.locator('#collusion-app').locator('.hist-row').allTextContents()
  await expect(page.locator('#collusion-app')).toContainText('seed 424242')
  // run again with the same seed: byte-identical histogram
  await page.locator('#run-collusion').click()
  await expect(page.locator('#collusion-app .hist-row').first()).toBeVisible({ timeout: 60_000 })
  const second = await page.locator('#collusion-app').locator('.hist-row').allTextContents()
  expect(second).toEqual(first)
  expect(first.length).toBeGreaterThan(0)
})

test('scenario links restore method, revocations, and selection', async ({ page }) => {
  await boot(page, '#m=cs&r=7,12&s=7')
  await expect(page.locator('#method-cs')).toBeChecked()
  await expect(page.locator('#stat-cs')).toHaveText('6')
  await expect(page.locator('#cover-app .header-list li')).toHaveCount(6)
  await expect(page.locator('#sub-cell-6.is-locked')).toBeVisible()
  // s=7 -> subscriber #7 preselected, and it is one of the revoked ones
  await expect(page.locator('#sub-detail')).toContainText('Subscriber #7')
  await expect(page.locator('#sub-detail')).toContainText('LOCKED OUT')
})
