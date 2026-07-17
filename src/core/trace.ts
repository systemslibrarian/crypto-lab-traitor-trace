/**
 * Black-box traitor tracing (NNL-style boundary tracing, simplified to a
 * deterministic binary search so every probe can be shown on screen).
 *
 * A probe with boundary b addresses every subscriber individually (the
 * trivial per-leaf cover) but wraps a DUD session key for subscribers 0..b-1
 * and the real session key for subscribers b..15. Every wrap is a genuine
 * AES-256-GCM encryption under the correct personal key, so each individual
 * entry authenticates; a corrupted entry simply yields a key that fails to
 * open the payload. probe(0) is indistinguishable from a normal broadcast;
 * probe(16) is openable by nobody.
 *
 * A decoder built from a single subscriber's keys therefore decrypts
 * probe(b) exactly when b <= u, and binary search pins u exactly. What a
 * coalition can do about this is the subject of trace.test.ts and the
 * collusion exhibit.
 */

import { randomBytes, utf8, utf8Decode } from './bytes'
import { subscriberDecrypt, type Broadcast, type UserKeyRing } from './broadcast'
import { csNodeKey } from './cs'
import { aesGcmOpen, aesGcmSeal } from './primitives'
import { leafNode, N } from './tree'

export interface Probe {
  boundary: number
  bc: Broadcast
}

/**
 * Craft a probe ciphertext. Real GCM everywhere; only the wrapped keys
 * differ. Already-revoked subscribers get no entry at all (exactly as in a
 * normal broadcast), which is what lets trace-and-revoke iterate: once a
 * traitor is revoked, its keys go dead on future probes too.
 */
export async function makeProbe(
  master: Uint8Array,
  boundary: number,
  message: string,
  revoked: ReadonlySet<number> = new Set(),
): Promise<Probe> {
  const sessionKey = randomBytes(32)
  const bc: Broadcast = {
    header: [],
    body: await aesGcmSeal(sessionKey, utf8(message)),
  }
  for (let u = 0; u < N; u++) {
    if (revoked.has(u)) continue
    const personalKey = await csNodeKey(master, leafNode(u))
    const wrapped = u < boundary ? randomBytes(32) : sessionKey
    bc.header.push({
      subset: { kind: 'cs', node: leafNode(u) },
      wrap: await aesGcmSeal(personalKey, wrapped),
    })
  }
  return { boundary, bc }
}

/**
 * greedy  — decrypts whenever any of its key sets recovers a working session key.
 * evasive — additionally compares outcomes across its key sets; when they
 *           disagree (one opens the payload, another authenticates but yields
 *           a dud) it knows the ciphertext is a probe and answers by coin flip.
 */
export type Strategy = 'greedy' | 'evasive'

/** Per-key-set outcome, exposed so the UI can show what the pirate box sees. */
export interface DecoderKeySetOutcome {
  u: number
  hadEntry: boolean
  opened: boolean
}

export interface DecoderAnswer {
  output: string | null
  /** True when the box could have decrypted (some key set works). */
  canDecrypt: boolean
  /** True when key-set outcomes disagree — actionable probe detection. */
  detected: boolean
  outcomes: DecoderKeySetOutcome[]
}

export interface PirateDecoder {
  rings: UserKeyRing[]
}

export async function pirateDecode(
  decoder: PirateDecoder,
  bc: Broadcast,
  strategy: Strategy,
  coin: () => number,
): Promise<DecoderAnswer> {
  const outcomes: DecoderKeySetOutcome[] = []
  let plaintext: string | null = null
  for (const ring of decoder.rings) {
    const r = await subscriberDecrypt(ring, bc)
    outcomes.push({ u: ring.u, hadEntry: r.entryIndex !== null, opened: r.opened })
    if (r.opened && plaintext === null) plaintext = r.plaintext
  }
  const withEntry = outcomes.filter((o) => o.hadEntry)
  const opens = withEntry.filter((o) => o.opened)
  const canDecrypt = opens.length > 0
  // Disagreement between its own entries is something no honest broadcast
  // ever shows the box; a key set with NO entry just looks revoked.
  const detected = canDecrypt && opens.length < withEntry.length
  if (!canDecrypt) return { output: null, canDecrypt, detected: false, outcomes }
  if (strategy === 'evasive' && detected) {
    const answer = coin() < 0.5 ? plaintext : null
    return { output: answer, canDecrypt, detected, outcomes }
  }
  return { output: plaintext, canDecrypt, detected, outcomes }
}

export interface TraceStep {
  boundary: number
  decrypted: boolean
  /** Search interval AFTER this step: the traitor candidate set is [lo..hi-1]. */
  lo: number
  hi: number
}

export interface TraceResult {
  /** Accused subscriber index, or null if the box would not decrypt at all. */
  accused: number | null
  steps: TraceStep[]
}

/**
 * Deterministic binary search for the boundary where the decoder goes
 * silent. Sound against any single traitor and against coalitions whose
 * decoder always decrypts when it can; see the collusion exhibit for what
 * an evasive coalition does to it.
 */
export async function traceTraitor(
  master: Uint8Array,
  decoder: PirateDecoder,
  strategy: Strategy,
  coin: () => number,
  revoked: ReadonlySet<number> = new Set(),
  onStep?: (step: TraceStep) => void | Promise<void>,
): Promise<TraceResult> {
  const steps: TraceStep[] = []
  const ask = async (boundary: number): Promise<boolean> => {
    const probe = await makeProbe(master, boundary, `probe boundary=${boundary}`, revoked)
    const answer = await pirateDecode(decoder, probe.bc, strategy, coin)
    return answer.output !== null
  }
  const record = async (s: TraceStep): Promise<void> => {
    steps.push(s)
    if (onStep) await onStep(s)
  }

  if (!(await ask(0))) {
    await record({ boundary: 0, decrypted: false, lo: 0, hi: 0 })
    return { accused: null, steps } // dead box: nothing to trace
  }
  await record({ boundary: 0, decrypted: true, lo: 0, hi: N })
  await record({ boundary: N, decrypted: await ask(N), lo: 0, hi: N })

  let lo = 0 // highest boundary known to decrypt
  let hi = N // lowest boundary known to fail
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    const decrypted = await ask(mid)
    if (decrypted) lo = mid
    else hi = mid
    await record({ boundary: mid, decrypted, lo, hi })
  }
  return { accused: lo, steps }
}

/** Deterministic PRNG for reproducible evasive-decoder runs (xorshift32). */
export function makeXorshift(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 0x1_0000_0000
  }
}

/** Sanity helper used by tests and the UI: can this box open this broadcast? */
export async function decoderOpens(
  decoder: PirateDecoder,
  bc: Broadcast,
): Promise<string | null> {
  const r = await pirateDecode(decoder, bc, 'greedy', () => 0)
  return r.output
}

export function describeProbe(probe: Probe): string {
  const dud = probe.boundary
  const good = 16 - probe.boundary
  return `${dud} dud ${dud === 1 ? 'entry' : 'entries'}, ${good} real`
}

/** Round-trip used by tests: a probe's body opens under its real session key path. */
export async function probeSelfTest(master: Uint8Array, boundary: number): Promise<boolean> {
  const probe = await makeProbe(master, boundary, 'self test')
  if (boundary >= N) return true
  const personalKey = await csNodeKey(master, leafNode(N - 1))
  const sk = await aesGcmOpen(personalKey, probe.bc.header[N - 1].wrap)
  if (sk === null) return false
  const pt = await aesGcmOpen(sk, probe.bc.body)
  return pt !== null && utf8Decode(pt) === 'self test'
}
