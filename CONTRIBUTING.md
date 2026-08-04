# Contributing

This is one lab in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) fleet. The
fleet-wide standard (chrome, pedagogy, accessibility gate, deploy shape) lives in
`CRYPTO-LAB-TEMPLATE.md` in the sibling [`crypto-lab`](https://github.com/systemslibrarian/crypto-lab)
catalog repo and is binding here.

## Setup and commands

```bash
npm ci
npm run dev            # Vite dev server
npm test               # Vitest unit tests (colocated as src/**/*.test.ts)
npm run test:coverage  # same tests + v8 coverage thresholds on src/core
npm run build          # tsc --noEmit + vite build
npm run test:a11y      # Playwright: behavior specs + axe WCAG 2.1 A/AA, both themes
npm run check:budget   # gzip bundle-size budget against dist/
```

The Playwright preview uses **port 4673** (unique per lab across the fleet — never change it
to 4173). Set `ALL_BROWSERS=1` to add Firefox and WebKit projects locally
(`npx playwright install` first); CI always runs all browsers plus a mobile viewport.

## Review expectations

- **Every quality gate must pass** before a change lands: unit tests (including the spec
  KATs), coverage thresholds, the typecheck-gated build, the bundle budget, and the
  behavior + accessibility browser suite in both themes. `ci.yml` runs all of this on PRs;
  `deploy.yml` re-runs the gates on `main` before publishing.
- **Never weaken the crypto to simplify the UI.** The cryptographic core (`src/core`) is the
  teaching subject: real WebCrypto, no simulated math, fail-closed error paths. See
  `DESIGN.md` for the invariants a change must preserve.
- **Precision of claims is a merge blocker.** UI copy and README statements about what an
  attack or bound achieves must be exactly true for the exact construction built here.
- **Chrome is this lab's own.** The top bar, hero block and scripture footer live in this
  repo and are edited here. There is no shared-header snippet and no script that reapplies
  one: the fleet-wide push (`shared-header.html` + `reapply-header.py`) was retired to
  `crypto-lab/archive/header-rollout/`. Keep the chrome visually consistent with the rest of
  the fleet by review, not by running anything.
- Tests are colocated (`src/core/foo.ts` → `src/core/foo.test.ts`); Playwright specs live in
  `e2e/` and are excluded from Vitest.
