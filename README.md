# Traitor Trace — crypto-lab

Broadcast encryption · subset-cover revocation · traitor tracing (Naor–Naor–Lotspiech 2001)

## What It Is

An interactive demonstration of **broadcast encryption with stateless receivers**: one
ciphertext readable by any authorized subscriber and no one else, a revoked member locked out
without rekeying anyone, and a leaked decoder traced back to whoever built it.

The construction is the Naor–Naor–Lotspiech (NNL 2001) subset-cover framework over a 16-leaf
binary tree of subscribers, with **both** canonical instantiations built and compared:

- **Complete Subtree (CS)** — one HKDF-SHA-256–derived key per tree node; each subscriber
  holds its 5 path keys; covers cost at most `r·log₂(N/r)` header entries.
- **Subset Difference (SD)** — GGM-style labels derived with HMAC-SHA-256 walks; each
  subscriber holds 10 labels plus a full-set key; covers cost at most `2r−1` entries,
  independent of N.

Payloads and key wraps are real WebCrypto **AES-256-GCM**; every lockout on the page is a
genuine GCM authentication failure. Tracing is black-box: crafted probe ciphertexts (dud
session keys wrapped in perfectly valid GCM entries) plus a binary search over where the
pirate box goes silent.

**Security model, honestly scoped:** confidentiality against any coalition of revoked
subscribers (no collusion bound); exact tracing of any single traitor; tracing of a coalition
member when the decoder always decrypts what it can; and a demonstrated **failure** of this
simple tracer against an evasive coalition — including framing an innocent subscriber. This
traces *keys*, not media: a pirate who re-streams decrypted content is outside the scheme's
power. **Not production crypto — a teaching demo** (16 subscribers instead of millions; the
"pirate decoder" is a transparent software box you assemble from real subscriber keys).

## Exhibits

1. **The naive corner** — both baselines with real key wraps: one shared group key (1-entry
   header, but revoking one subscriber reissues 15 keys, shown as 15 live AES-GCM wraps) vs.
   one wrap per subscriber (free revocation, but the header carries the whole roster forever).
2. **The subset cover** — the headline mechanism. Click subscribers to revoke; the CS and SD
   cover *subtrees light up as regions on the tree* (SD exclusions painted back out), the
   header shrinks (e.g. revoke #7 + #12: SD = 2 wraps, CS = 6, naive = 14), and all sixteen
   decoders are tested against the real ciphertext. Selecting a subscriber highlights its
   membership chain up to its one covering subset and compares both sides byte-for-byte:
   the session key it derived vs. the one the center generated. Each detail view renders the
   **cryptographic result and the security verdict as separate indicators** — a revoked
   decoder shows "AES-GCM: authentication failed" (a forced attempt that really runs) next to
   "verdict: LOCKED OUT — holding ✓", and its key-ring fingerprint proves no revocation ever
   rewrote anyone's keys.
3. **The tracing** — build a pirate decoder from any subscribers' key sets. It opens a
   subscribers-only broadcast (crypto: valid ✓ / verdict: BREACH ✗ — the lab's point in one
   card), then probe ciphertexts binary-search the roster until the box's owner is named.
   Trace-and-revoke finishes the job: revoke the accused, watch the box die or survive, trace
   again.
4. **Collusion — the honest limit** — two revoked subscribers pool keys and still open
   nothing; a "look through the box's eyes" view shows one probe from the decoder's side
   (one of its entries opens the payload, the other authenticates but yields a dud — an
   asymmetry honest traffic never shows, and the reason a lone box can never dodge); then the
   evasive coalition box answers detected probes by coin flip and drags 25 tracing runs across
   the roster, framing innocents. The bound is stated precisely in-page, along with what the
   full NNL procedure does about it.

Plus context panels: the licensed-database framing (per-institution keys, lapsed
subscriptions, leaked proxy credentials — same math), and AACS on Blu-ray (subset difference
in the Media Key Block, the 2007 processing-key leak, what revocation could and could not do).

## When to Use It

- Teaching how one ciphertext can address an arbitrary authorized subset without per-recipient
  cost, and why "revocation without rekeying" is the hard requirement.
- Showing the difference between a cryptographic result and a security verdict — forged/pirate
  decryptions that *succeed* are rendered as alarms, not green checkmarks.
- Demonstrating black-box traitor tracing and its precise limits, including a live false
  accusation past the collusion guarantee.
- **Do NOT use it** to protect real content, to size a production broadcast system, or to
  treat this tracer's output as evidence — Exhibit 4 exists to show you exactly why.

## Live Demo

**<https://systemslibrarian.github.io/crypto-lab-traitor-trace/>**

Revoke subscribers by clicking tree leaves, switch CS/SD covers, broadcast your own message,
build a pirate decoder, run the trace, and push the tracer past its guarantee.

Every configuration is linkable: **Copy scenario link** serializes the method, revocation
set, selected subscriber, decoder composition, and the collusion strategy + PRNG seed into
the URL hash (e.g. `#m=sd&r=7,12&s=1&ca=4&cb=13&st=evasive&seed=424242`), so a lecture
slide or issue report can reopen the exact state under discussion — including a
byte-identical collusion histogram.

## What Can Go Wrong

- **Endpoint leaks aren't fixable by crypto** — a paying subscriber can re-share what it
  legitimately decrypted; AACS's history is the case study.
- **Revocation is forward-only** — new headers exclude the compromised keys; old ciphertexts
  already published stay decryptable by them.
- **Naive tracing can frame the innocent** — an evasive coalition box turns the boundary
  search into a coin-flip walk; only the assumptions-stated NNL procedure (repeated queries,
  probability estimates, subset partitioning) restores guarantees.
- **A wrong cover is a catastrophe** — a subset that accidentally contains a revoked leaf
  re-admits it. The test suite checks the partition property exhaustively for every single
  and pairwise revocation and random larger sets.

## Real-World Usage

AACS (Blu-ray) uses exactly this subset-difference scheme in its Media Key Block, and its
device-key revocations after the 2007 leaks are subset-cover updates. The same pattern —
stateless receivers, tree-derived keys, cover-based revocation — appears in pay-TV
conditional access and licensed-content distribution generally.

## How to Run Locally

```bash
npm ci
npm run dev            # Vite dev server
npm test               # 50 Vitest unit tests, incl. 10 spec KATs
npm run test:coverage  # same, with v8 coverage thresholds on src/core
npm run build          # typecheck + production build
npm run test:a11y      # behavior specs + axe WCAG 2.1 A/AA, both themes (port 4673)
npm run check:budget   # gzip bundle-size budget against dist/
```

Set `ALL_BROWSERS=1` to add Firefox and WebKit to the Playwright run (CI always does).
See `CONTRIBUTING.md`, `DESIGN.md` (paper-to-code map + invariants), and `SECURITY.md`.

## Related Demos

- [crypto-lab-mls-group](https://systemslibrarian.github.io/crypto-lab-mls-group/) — MLS/TreeKEM:
  forward secrecy via *interactive* group key agreement, where broadcast encryption is
  stateless and one-way.
- [crypto-lab-envelope-kms](https://systemslibrarian.github.io/crypto-lab-envelope-kms/) —
  envelope encryption and key management.

## Build & Verify

- **50 unit tests** (Vitest, colocated in `src/core/*.test.ts`), including **10 spec KATs**:
  RFC 5869 HKDF-SHA-256 cases 1–3, RFC 4231 HMAC-SHA-256 cases 1–2, FIPS 180 SHA-256, and
  NIST AES-256-GCM test cases 13–16 (`src/core/kats.test.ts`).
- Scheme tests cover: cover-partition correctness for both methods (all singletons, all 120
  pairs, random sets of every size), GGM label derivation matching the center with fail-closed
  non-member derivation, broadcast round-trips, revoked-key pooling, exact single-traitor
  tracing for all 16 subscribers, coalition tracing, trace-and-revoke, and a passing test that
  the evasive-coalition flaw **does** frame an innocent (the deliberately-exhibited failure).
- **Coverage thresholds** are enforced on the crypto core (`npm run test:coverage`, v8
  provider: ≥90% statements/functions/lines, ≥85% branches on `src/core`).
- **Browser behavior is regression-tested**, not just scanned: `e2e/behavior.spec.ts` asserts
  the rendered numbers and verdicts (SD=2/CS=6/naive=14 for the preset revocation, the
  LOCKED OUT and BREACH verdict cards, the full trace-accuse-revoke-die flow, and a
  seed-reproducible collusion histogram) alongside the axe scans in `e2e/a11y.spec.ts`.
- **Two workflows**: `ci.yml` runs everything on pull requests (Node 22 + 24, coverage,
  bundle budget, Chromium/Firefox/WebKit plus a mobile viewport); `deploy.yml` re-runs
  tests, build, and the a11y gate on `main` and only then publishes to GitHub Pages.

## Performance

Everything is interactive-speed in the browser: a full broadcast plus sixteen decryption
attempts is ~40 AES-GCM operations, and the 25-trace collusion run is a few thousand WebCrypto
calls (a second or two). Key setup derives all sixteen key rings from one 32-byte seed at page
load. These claims are kept true by CI: a gzip bundle-size budget (`npm run check:budget`)
fails the build if the demo bloats.

---

*One of 170+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
