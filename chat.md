# What Would Make This the Gold Standard

## Bottom line

This is already much closer to "gold standard" than a typical crypto demo repo. The current bar is high because the repo combines four things that usually do not appear together: honest scope limits, real cryptography, strong core tests, and an automated accessibility gate.

What is still missing is not basic correctness. The remaining gap is mostly repo/process maturity and browser-level regression protection.

## What is already unusually strong

- The README is serious and technically honest. It explains what is real, what is scaled down, what the tracer can and cannot prove, and where the failure mode is intentionally demonstrated. See [README.md](README.md).
- The cryptographic core is cleanly separated from the UI. The project structure makes it easy to audit the algorithms independently of presentation: [src/core](src/core) and [src/ui](src/ui).
- The test suite is substantive, not decorative. `npm test` currently passes 46 tests, including KAT coverage and tracing/collusion cases. Representative files: [src/core/kats.test.ts](src/core/kats.test.ts), [src/core/cover.test.ts](src/core/cover.test.ts), [src/core/trace.test.ts](src/core/trace.test.ts).
- Accessibility is enforced, not merely claimed. The repo has a dedicated Playwright + axe test that drives the exhibits before scanning both themes: [e2e/a11y.spec.ts](e2e/a11y.spec.ts).
- Deployment already gates on tests, build, and a11y before publishing to Pages. See [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Highest-leverage gaps

### 1. Add pull-request CI gating before merge

Evidence: the only workflow in the repo is a deploy workflow triggered on `push` to `main` and `workflow_dispatch`: [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

Why this matters: gold-standard repos block regressions before they land on `main`, not after.

Upgrade:

- Add a separate `ci.yml` on `pull_request`.
- Make `npm test`, `npm run build`, and `npm run test:a11y` required checks.
- Optionally test a small Node matrix such as current LTS plus current stable.

### 2. Add browser behavior regression tests, not just accessibility scans

Evidence: the only end-to-end file under `e2e/` is [e2e/a11y.spec.ts](e2e/a11y.spec.ts), and there are no UI-side test files under [src/ui](src/ui).

Why this matters: this project is a teaching demo. Its truth is expressed partly in the DOM: counts, verdict labels, tree highlights, trace steps, and explanatory states. Core tests prove the algorithms; they do not prove that the UI is faithfully rendering the algorithms.

Upgrade:

- Add Playwright assertions for the headline flows.
- Example: revoke subscribers #7 and #12 and assert the displayed wrap counts match the README claim: SD = 2, CS = 6, naive per-recipient = 14.
- Example: build a decoder from subscriber #12, run the trace, and assert the accusation and follow-up revoke behavior.
- Example: run the evasive coalition scenario and assert that the histogram can accuse an innocent subscriber under the adversarial seed.

### 3. Add coverage reporting and thresholds

Evidence: the package scripts expose `test`, `build`, and `test:a11y`, but there is no visible coverage script or threshold configuration in [package.json](package.json).

Why this matters: a repo that teaches security-sensitive logic should quantify test reach, especially branch coverage around revoked/no-entry/auth-failure/evasive paths.

Upgrade:

- Add `vitest --coverage`.
- Set thresholds, ideally stricter for [src/core](src/core) than for the UI.
- Publish the coverage artifact in CI so regressions are obvious.

### 4. Add contributor and auditor docs at the repo root

Evidence: the root contains [README.md](README.md), but there is no `LICENSE`, no `CONTRIBUTING`, and no short architecture/audit guide in the root listing.

Why this matters: gold-standard public repos are easy to review, reuse, and extend by someone who did not author them.

Upgrade:

- Add a `LICENSE` file.
- Add `CONTRIBUTING.md` with local commands and review expectations.
- Add a short `DESIGN.md` mapping the major paper ideas to code entry points.
- Add `SECURITY.md` that explicitly says this is a teaching demo and defines what kinds of reports are in scope.

### 5. Add cross-browser and mobile coverage

Evidence: [playwright.config.ts](playwright.config.ts) defines a single default Playwright configuration and does not declare browser projects or mobile viewports.

Why this matters: interactive browser demos often fail at the edges first: layout collapse, focus order, clipped tree visualizations, or subtle engine-specific behavior.

Upgrade:

- Run the existing browser tests in Chromium, Firefox, and WebKit.
- Add at least one narrow/mobile viewport.
- Add a small number of visual snapshots for the tree/cover states if you want stronger protection against accidental UI drift.

### 6. Add shareable, deterministic scenario URLs

Evidence: there is no URL/state handling visible in `src/` for query-string or hash-based state serialization.

Why this matters: the best teaching demos are easy to cite in lectures, issue reports, and reviews. A reviewer should be able to open a URL and land on the exact revocation set, method, selected subscriber, decoder composition, theme, and collusion seed being discussed.

Upgrade:

- Encode revocations, method, selected subscriber, decoder members, theme, and trace seed into the URL.
- Make the evasive-collusion run seedable and reproducible.
- Add a "copy link to current scenario" control.

### 7. Add automated performance budgets

Evidence: the README has a performance section, but the repo does not expose any automated performance or bundle-budget checks in its scripts or workflow. See [README.md](README.md) and [package.json](package.json).

Why this matters: once a repo makes concrete performance claims, gold-standard practice is to keep those claims continuously true.

Upgrade:

- Add a simple Lighthouse or Playwright-based performance smoke check.
- Add a bundle-size budget.
- Fail CI if the demo crosses a budget that would make classroom use noticeably worse.

## Best order to do the work

1. PR CI gating.
2. Browser behavior regression tests.
3. Coverage reporting and thresholds.
4. Root-level contributor/auditor docs.
5. Cross-browser and mobile coverage.
6. Shareable deterministic scenario URLs.
7. Performance budgets.

## Short verdict

If you do only three things, do these:

1. Move the current quality gates from "deploy-time on main" to "required before merge".
2. Add real end-to-end behavior assertions for the teaching flows, not just accessibility scans.
3. Add repo-level audit/contributor packaging so outsiders can verify and extend the work quickly.

That would move this from "excellent demo" to "reference-quality demo repo".

## Validation run on 2026-07-17

- `npm test`: passed, 46 tests.
- `npm run build`: passed.
- `npm run test:a11y`: passed, 2 Playwright accessibility tests.