# Design — paper ideas mapped to code

An audit guide for reviewers: where each idea from Naor–Naor–Lotspiech,
*"Revocation and Tracing Schemes for Stateless Receivers"* (CRYPTO 2001), lives in this
repo, and the invariants the architecture embodies.

## The map

| Paper idea | Code entry point |
| --- | --- |
| Binary tree of stateless receivers (heap-numbered, N=16) | `src/core/tree.ts` |
| Complete Subtree method (§3.1): per-node keys, Steiner-tree cover | `src/core/cs.ts` (`csNodeKey`, `csUserKeys`, `csCover`) |
| Subset Difference method (§3.2): S(i∖j) subsets, ≤ 2r−1 cover | `src/core/sd.ts` (`sdCover`) |
| GGM label derivation (left/right/key PRF walks) | `src/core/sd.ts` (`sdLabelWalk`, `sdSubsetKey`, `sdUserKeys`, `sdUserDeriveKey`) |
| Header of wrapped session keys + payload under one session key | `src/core/broadcast.ts` (`encryptBroadcast`, `subscriberDecrypt`) |
| Naive baselines the schemes beat | `src/core/broadcast.ts` (`encryptNaivePerRecipient`), Exhibit 1 UI |
| Black-box tracing via hybrid/probe ciphertexts | `src/core/trace.ts` (`makeProbe`, `traceTraitor`) |
| Pirate-decoder models (always-decrypt vs probe-detecting) | `src/core/trace.ts` (`Strategy`, `pirateDecode`) |
| Trace-and-revoke loop | `traceTraitor`'s `revoked` parameter + Exhibit 3 UI |
| Primitives (all real, via WebCrypto) | `src/core/primitives.ts` — HKDF-SHA-256, HMAC-SHA-256, AES-256-GCM |

The UI (`src/ui/`) renders the core and never reimplements it; every number shown on the
page is computed by the modules above at interaction time.

## Security / correctness invariants

1. **Cover partition**: for any revocation set, the cover subsets are disjoint and their
   union is exactly the non-revoked leaves (`cover.test.ts` checks all singletons, all 120
   pairs, and random sets of every size, for both methods).
2. **Key-derivation soundness**: a subscriber derives a subset key iff it is a member of
   that subset; non-member derivation returns `null` (fail-closed), never a wrong key
   (`keys.test.ts`).
3. **Fail-closed crypto**: `aesGcmOpen` returns `null` on any failure; there is no code
   path that treats an unauthenticated plaintext as valid.
4. **Stateless receivers**: key rings are computed once at setup; revocation only changes
   the header (asserted by re-deriving rings after a revocation in `broadcast.test.ts`).
5. **Verdict separation**: the UI renders the cryptographic result and the security verdict
   as independent indicators; color tracks system integrity, not the raw return value.
6. **The exhibited flaw is real and contained**: the evasive-coalition failure is produced
   by genuine crypto (GCM disagreement detection) under an explicitly labeled adversarial
   strategy, and `trace.test.ts` pins it (adversarial coins → innocent accused). It is never
   the default path.

If an invariant ever conflicts with a feature, the invariant wins.

## Deliberate simplifications (and where the paper differs)

- **One-query deterministic tracer**: NNL's subset tracing repeats queries to estimate
  decryption probabilities and partitions by subsets; this repo implements the simplest
  boundary search so every probe is visible on screen, and demonstrates precisely where
  that simplification fails (Exhibit 4, in-page bound statement).
- **Probes use the trivial per-leaf cover** so corruption is a per-subscriber choice; the
  paper's tracer works over arbitrary subset partitions.
- **N=16** for legibility. The core is N-generic (`// [extension]` marker in `tree.ts`).

## Extension seams

Marked with `// [extension] point` in the source:

- `tree.ts` — deeper trees (only the UI assumes 16 leaves).
- `sd.ts` — Layered SD (Halevy–Shamir) reuses `SDSubset`; only `sdCover`/`sdUserKeys` change.
- `trace.ts` — additional pirate strategies (stateful, threshold-q, self-destructing boxes).
