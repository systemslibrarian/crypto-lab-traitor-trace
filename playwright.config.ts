import { defineConfig, devices } from '@playwright/test'

// Firefox/WebKit run only when ALL_BROWSERS is set (the CI workflow sets it
// and installs all browsers). The deploy workflow installs Chromium only, so
// the default project set must stay Chromium-based.
const allBrowsers = !!process.env.ALL_BROWSERS

export default defineConfig({
  testDir: './e2e',
  // WebCrypto throughput varies ~4x across engines; the collusion exhibit
  // runs thousands of real AES-GCM calls, so give tests generous headroom.
  timeout: 240_000,
  // Four browser projects share one preview server and saturate WebCrypto;
  // uncapped workers cause timeout flakes in the slower engines.
  workers: allBrowsers ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4673/crypto-lab-traitor-trace/',
    colorScheme: 'dark',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    ...(allBrowsers
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
  webServer: {
    // Build before previewing. `vite preview` only serves whatever is already
    // in dist/, so without this a failed build leaves the last good bundle in
    // place and the suite passes green against source that no longer compiles.
    command: 'npm run build && npm run preview -- --port 4673 --strictPort',
    url: 'http://localhost:4673/crypto-lab-traitor-trace/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
