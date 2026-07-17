/**
 * Exhibit 4 — the honest limit. Two demonstrations, both against real
 * crypto: pooled REVOKED keys still decrypt nothing (encryption is fully
 * collusion-resistant), and an evasive two-traitor decoder can drag the
 * simple tracer onto an innocent subscriber (tracing is not unconditional).
 */

import { encryptBroadcast } from '../core/broadcast'
import { makeProbe, pirateDecode, traceTraitor, makeXorshift, type Strategy } from '../core/trace'
import { N } from '../core/tree'
import { el, resultLine, subLabel, verdictCard, clear } from './dom'
import type { Lab } from './lab'
import { scenarioGet, scenarioSet } from './scenario'

export async function initCollusionPanel(lab: Lab, mount: HTMLElement): Promise<void> {
  let busy = false

  // --- part 1: pooled revoked keys -------------------------------------
  const poolBtn = el('button', { class: 'primary', type: 'button', id: 'pool-revoked', text: 'Revoke #7 + #12, then pool their keys' })
  const poolBox = el('div', { 'aria-live': 'polite' })
  poolBtn.addEventListener('click', () => void runPool())

  async function runPool(): Promise<void> {
    if (busy) return
    busy = true
    try {
      const revoked = new Set([6, 11])
      const { bc } = await encryptBroadcast(lab.master, 'sd', revoked, 'not for the revoked')
      const answer = await pirateDecode({ rings: [lab.rings[6], lab.rings[11]] }, bc, 'greedy', () => 0)
      clear(poolBox)
      poolBox.append(
        verdictCard('ok', [
          resultLine('Setup', 'neutral', '#7 and #12 revoked; their two full key rings copied into one box'),
          resultLine('Header entries their pooled keys can address', 'neutral', '0 of 2 — every cover subset excludes both of them by construction'),
          resultLine('AES-GCM result', 'neutral', answer.output === null ? 'no decryption — no derivable subset key exists' : 'decrypted (this would be a bug)'),
          resultLine(
            'Security verdict',
            answer.output === null ? 'ok' : 'alarm',
            answer.output === null
              ? 'HOLDING — revoked subscribers can pool keys in any number and still decrypt nothing. Confidentiality here has no collusion bound at all.'
              : 'BREACH — the scheme failed',
          ),
        ]),
      )
    } finally {
      busy = false
    }
  }

  // --- part 2: the tracing limit ---------------------------------------
  const urlSub = (key: string, fallback: number): number => {
    const v = Number.parseInt(scenarioGet(key) ?? '', 10) - 1
    return v >= 0 && v < N ? v : fallback
  }
  const selA = makeSelect('collusion-a', urlSub('ca', 3))
  const selB = makeSelect('collusion-b', urlSub('cb', 12))
  let strategy: Strategy = scenarioGet('st') === 'greedy' ? 'greedy' : 'evasive'

  // Seeded PRNG makes every histogram reproducible from its scenario link.
  const urlSeed = Number.parseInt(scenarioGet('seed') ?? '', 10)
  const seedInput = el('input', {
    type: 'text',
    id: 'collusion-seed',
    class: 'seed-input',
    inputmode: 'numeric',
  }) as HTMLInputElement
  seedInput.value = String(
    Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 999_999),
  )
  const stratSet = el('fieldset', {}, [el('legend', { text: 'Decoder strategy' })])
  for (const [value, label] of [
    ['greedy', 'always decrypts when it can'],
    ['evasive', 'detects probes, answers by coin flip'],
  ] as const) {
    const input = el('input', { type: 'radio', name: 'strategy', value, id: `strat-${value}` }) as HTMLInputElement
    input.checked = value === strategy
    input.addEventListener('change', () => {
      strategy = value
    })
    stratSet.append(el('label', { for: `strat-${value}` }, [input, ` ${label} `]))
  }

  const peekBtn = el('button', { type: 'button', id: 'peek-probe', text: 'Look through the box’s eyes at one probe' }) as HTMLButtonElement
  const peekBox = el('div', { 'aria-live': 'polite', id: 'peek-box' })
  const runBtn = el('button', { class: 'primary', type: 'button', id: 'run-collusion', text: 'Run 25 traces' }) as HTMLButtonElement
  const histBox = el('div', {})
  const summaryBox = el('div', { role: 'status', 'aria-live': 'polite' })

  peekBtn.addEventListener('click', () => void runPeek())
  runBtn.addEventListener('click', () => void runMany())

  /** Show the decoder's-eye view of the one probe it can always detect. */
  async function runPeek(): Promise<void> {
    if (busy) return
    const a = Number(selA.value)
    const b = Number(selB.value)
    if (a === b) {
      clear(peekBox)
      peekBox.append(verdictCard('warn', [resultLine('Setup', 'warn', 'pick two different subscribers first')]))
      return
    }
    busy = true
    try {
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      // boundary = hi corrupts everything below hi: lo's entry goes dud
      // while hi's still works — the detectable disagreement, guaranteed.
      const probe = await makeProbe(lab.master, hi, 'probe payload')
      const answer = await pirateDecode({ rings: [lab.rings[lo], lab.rings[hi]] }, probe.bc, 'evasive', () => 0)
      clear(peekBox)
      const lines: HTMLElement[] = [
        el('h3', { text: `What the box sees on probe boundary=${hi} (subscribers below ${subLabel(hi)} get dud keys)` }),
      ]
      for (const o of answer.outcomes) {
        lines.push(
          resultLine(
            `Via ${subLabel(o.u)}’s keys`,
            'neutral',
            o.opened
              ? 'entry authenticates ✓ → recovered session key OPENS the payload'
              : 'entry authenticates ✓ → recovered session key is a dud (payload tag rejects it)',
          ),
        )
      }
      lines.push(
        resultLine(
          'The comparison',
          'warn',
          'its own two entries disagree — honest broadcasts never do that. The box now KNOWS this is a probe, and it can still decrypt: its answer has become a free choice.',
        ),
        resultLine(
          'A lone box, for contrast',
          'neutral',
          'one key set = one entry = nothing to compare. It either decrypts (and the probe looked like normal traffic) or it can’t (and silence is exactly what the tracer expected). That is the entire collusion bound.',
        ),
      )
      peekBox.append(verdictCard('warn', lines))
    } finally {
      busy = false
    }
  }

  function makeSelect(id: string, initial: number): HTMLSelectElement {
    const sel = el('select', { id }) as HTMLSelectElement
    for (let u = 0; u < N; u++) {
      const opt = el('option', { value: String(u), text: subLabel(u) }) as HTMLOptionElement
      if (u === initial) opt.selected = true
      sel.append(opt)
    }
    return sel
  }

  async function runMany(): Promise<void> {
    if (busy) return
    const a = Number(selA.value)
    const b = Number(selB.value)
    if (a === b) {
      clear(summaryBox)
      summaryBox.append(verdictCard('warn', [resultLine('Setup', 'warn', 'pick two different subscribers — one traitor is Exhibit 3’s case')]))
      return
    }
    busy = true
    runBtn.disabled = true
    try {
      const seedBase = Number.parseInt(seedInput.value, 10) || 1
      seedInput.value = String(seedBase)
      scenarioSet({
        ca: String(a + 1),
        cb: String(b + 1),
        st: strategy,
        seed: String(seedBase),
      })
      const decoder = { rings: [lab.rings[a], lab.rings[b]] }
      const counts = new Array<number>(N).fill(0)
      const RUNS = 25
      // Runs are independent (one seeded coin each), so they race in parallel.
      const results = await Promise.all(
        Array.from({ length: RUNS }, (_, run) => {
          const coin = makeXorshift((seedBase ^ Math.imul(run + 1, 0x9e3779b9)) >>> 0)
          return traceTraitor(lab.master, decoder, strategy, coin)
        }),
      )
      for (const result of results) {
        if (result.accused !== null) counts[result.accused]++
      }
      clear(histBox)
      histBox.append(el('h3', { text: `Who got accused (${RUNS} independent traces, traitors ${subLabel(a)} and ${subLabel(b)}, ${strategy} box)` }))
      const maxCount = Math.max(...counts, 1)
      let innocentHits = 0
      counts.forEach((count, u) => {
        if (count === 0) return
        const isTraitor = u === a || u === b
        if (!isTraitor) innocentHits += count
        const row = el('div', { class: `hist-row${isTraitor ? '' : ' innocent'}` }, [
          el('span', { class: 'hist-label', text: `${subLabel(u)} ${isTraitor ? '(traitor)' : '(INNOCENT ⚠)'}` }),
          el('span', { class: 'hist-bar', style: `width:${(count / maxCount) * 14}rem`, 'aria-hidden': 'true' }),
          el('span', { class: 'hist-count', text: `${count}×` }),
        ])
        histBox.append(row)
      })
      clear(summaryBox)
      const seedLine = resultLine(
        'Reproducibility',
        'neutral',
        `seed ${seedBase} — “Copy scenario link” reproduces this exact histogram`,
      )
      if (innocentHits > 0) {
        summaryBox.append(
          verdictCard('alarm', [
            resultLine('Tracer output', 'neutral', `accusations landed on ${counts.filter((c) => c > 0).length} different subscribers across ${RUNS} runs`),
            resultLine('Security verdict', 'alarm', `FALSE ACCUSATION — ${innocentHits} of ${RUNS} runs blamed a subscriber whose keys are NOT in the box. Past its collusion guarantee, this tracer doesn't just miss traitors; it can frame the innocent.`),
            seedLine,
          ]),
        )
      } else {
        summaryBox.append(
          verdictCard('ok', [
            resultLine('Tracer output', 'neutral', `every accusation named ${counts[b] > 0 && counts[a] > 0 ? 'a coalition member' : subLabel(counts[a] > 0 ? a : b)}`),
            resultLine('Security verdict', 'ok', 'within the guarantee: a box that always decrypts when it can — even with pooled keys — always surrenders a real traitor'),
            seedLine,
          ]),
        )
      }
    } finally {
      busy = false
      runBtn.disabled = false
    }
  }

  mount.append(
    el('h3', { text: 'First: pooling revoked keys buys nothing' }),
    el('div', { class: 'controls-row' }, [poolBtn]),
    poolBox,
    el('h3', { text: 'Then: where tracing ends' }),
    el('div', { class: 'controls-row' }, [
      el('label', { for: 'collusion-a', text: 'Traitor 1:' }),
      selA,
      el('label', { for: 'collusion-b', text: 'Traitor 2:' }),
      selB,
      stratSet,
      el('label', { for: 'collusion-seed', text: 'Seed:' }),
      seedInput,
      peekBtn,
      runBtn,
    ]),
    peekBox,
    histBox,
    summaryBox,
  )

  mount.insertAdjacentHTML(
    'beforeend',
    `<details class="expert"><summary>The bound, stated precisely</summary>
      <p><strong>What this page's tracer guarantees.</strong> It is a one-query-per-probe deterministic
      binary search. It always identifies the traitor when the decoder holds ONE subscriber's keys, and
      always identifies SOME coalition member when the decoder answers deterministically whenever it can
      decrypt (both are covered by this repo's test suite). Trace-and-revoke then removes traitors one
      per round.</p>
      <p><strong>Where it fails, and why.</strong> A coalition's box holds entries at two positions. On a
      probe whose boundary falls strictly between them, one entry recovers a key that opens the payload
      while the other entry authenticates but yields a dud — an asymmetry no honest broadcast produces.
      The box therefore KNOWS it is being probed while still being able to decrypt, and if it answers
      such probes randomly, the search's monotonicity assumption collapses: it can converge anywhere
      between the two traitors, including on an innocent subscriber. That is what the histogram above
      shows, and why a real system must not treat this tracer's output as proof.</p>
      <p><strong>What NNL actually do about it.</strong> The full Naor–Naor–Lotspiech subset-tracing
      procedure repeats queries to estimate the box's decryption <em>probability</em> on each hybrid and
      partitions suspicion by subsets rather than a single boundary. Under its model — a resettable,
      stateless box that must keep decrypting with probability above a usefulness threshold — it traces
      coalitions of ANY size, at the cost of far more probes. Tracing against stateful or
      self-destructing pirates is a genuinely harder problem beyond this demo's scope.</p>
    </details>`,
  )
}
