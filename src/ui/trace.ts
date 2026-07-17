/**
 * Exhibit 3 — build a pirate decoder from real subscriber keys, then hunt it
 * with real probe ciphertexts. Ends with the trace-and-revoke loop.
 */

import { encryptBroadcast } from '../core/broadcast'
import {
  decoderOpens,
  pirateDecode,
  traceTraitor,
  type PirateDecoder,
  type TraceStep,
} from '../core/trace'
import { N } from '../core/tree'
import { el, pause, resultLine, subLabel, verdictCard, clear } from './dom'
import type { Lab } from './lab'

export async function initTracePanel(lab: Lab, mount: HTMLElement): Promise<void> {
  let decoder: PirateDecoder | null = null
  let traitors: number[] = []
  const revoked = new Set<number>()
  let busy = false

  // --- traitor pickers --------------------------------------------------
  const checks: HTMLInputElement[] = []
  const checkGrid = el('div', { class: 'trait-checks' })
  for (let u = 0; u < N; u++) {
    const input = el('input', { type: 'checkbox', id: `traitor-${u}` }) as HTMLInputElement
    if (u === 11) input.checked = true // a default so one click can start
    checks.push(input)
    checkGrid.append(el('label', { for: `traitor-${u}` }, [input, ` ${subLabel(u)}`]))
  }

  const buildBtn = el('button', { class: 'primary', type: 'button', id: 'build-decoder', text: 'Build the pirate decoder' })
  const traceBtn = el('button', { class: 'primary', type: 'button', id: 'run-trace', text: 'Run the trace' }) as HTMLButtonElement
  traceBtn.disabled = true

  const decoderBox = el('div', { 'aria-live': 'polite' })
  const probeLog = el('ol', { class: 'probe-log', 'aria-live': 'polite', 'aria-label': 'Probe transcript' })
  const verdictBox = el('div', { 'aria-live': 'polite' })

  mount.append(
    el('p', { text: 'Choose whose keys get copied into the box (any number — one is the classic case, two sets up Exhibit 4):' }),
    checkGrid,
    el('div', { class: 'controls-row' }, [buildBtn, traceBtn]),
    decoderBox,
    probeLog,
    verdictBox,
  )

  mount.insertAdjacentHTML(
    'beforeend',
    `<details class="expert"><summary>Why a lone decoder cannot dodge this</summary>
      <p>A probe with boundary <em>b</em> gives every subscriber below <em>b</em> a dud session key —
      wrapped, like the real one, in a perfectly valid AES-GCM entry under that subscriber's own key.
      A box holding ONE subscriber's keys sees only its own entry. When that entry works, the probe is
      byte-for-byte indistinguishable from ordinary traffic, so refusing to answer would make the box
      useless as a product; when the entry yields a dud, the box may well realize it is being probed —
      but it cannot decrypt, and silence is exactly what the tracer expected to see. Either way the
      binary search closes in. This argument is specific to single-key boxes; Exhibit 4 shows precisely
      how it breaks for coalitions.</p>
    </details>`,
  )

  buildBtn.addEventListener('click', () => {
    if (busy) return
    traitors = checks.flatMap((c, u) => (c.checked ? [u] : []))
    revoked.clear()
    decoder = { rings: traitors.map((u) => lab.rings[u]) }
    clear(probeLog)
    clear(verdictBox)
    void showDecoder()
  })

  async function showDecoder(): Promise<void> {
    clear(decoderBox)
    if (!decoder) return
    if (traitors.length === 0) {
      decoderBox.append(
        verdictCard('warn', [
          resultLine('Decoder', 'warn', 'an empty box — nobody’s keys inside, nothing to trace'),
        ]),
      )
      traceBtn.disabled = true
      return
    }
    // The breach moment: real crypto succeeds, and that success IS the alarm.
    const { bc } = await encryptBroadcast(lab.master, 'sd', new Set(), 'subscriber-only broadcast')
    const opened = await decoderOpens(decoder, bc)
    decoderBox.append(
      verdictCard('alarm', [
        el('h3', { text: `A pirate decoder appears (${traitors.length} key ${traitors.length === 1 ? 'set' : 'sets'} inside — the tracer doesn't know that)` }),
        resultLine('AES-GCM result', 'ok', opened !== null ? `opened a subscribers-only broadcast: “${opened}”` : 'failed to decrypt'),
        resultLine('Security verdict', 'alarm', 'BREACH — valid decryption by a box nobody authorized. The crypto worked; the system is compromised.'),
      ]),
    )
    traceBtn.disabled = false
  }

  traceBtn.addEventListener('click', () => {
    if (busy || !decoder) return
    void runTrace()
  })

  async function renderStep(step: TraceStep): Promise<void> {
    const cells = el('span', { class: 'probe-cells', 'aria-hidden': 'true' })
    for (let u = 0; u < N; u++) {
      const cls = revoked.has(u) ? 'probe-cell gone' : u < step.boundary ? 'probe-cell dud' : 'probe-cell'
      cells.append(el('span', { class: cls, text: revoked.has(u) ? '·' : u < step.boundary ? 'd' : 'k' }))
    }
    const duds = [...Array(N).keys()].filter((u) => !revoked.has(u) && u < step.boundary).length
    const reals = [...Array(N).keys()].filter((u) => !revoked.has(u) && u >= step.boundary).length
    const row = el('li', { class: 'probe-row' }, [
      el('span', { text: `probe b=${step.boundary}` }),
      cells,
      el('span', { class: 'decoder-chip' }, [
        el('span', { class: step.decrypted ? 'status-ok' : 'status-neutral', text: step.decrypted ? '✓ box decrypted' : '— box silent' }),
      ]),
      el('span', {
        class: 'panel-lead',
        text: `${duds} dud + ${reals} real entries · suspects now ${subLabel(step.lo)}…${subLabel(Math.max(step.lo, step.hi - 1))}`,
      }),
    ])
    probeLog.append(row)
    await pause(420)
  }

  async function runTrace(): Promise<void> {
    if (!decoder) return
    busy = true
    traceBtn.disabled = true
    buildBtn.disabled = true
    clear(probeLog)
    clear(verdictBox)
    try {
      const result = await traceTraitor(lab.master, decoder, 'greedy', () => 0, revoked, renderStep)
      if (result.accused === null) {
        verdictBox.append(
          verdictCard('ok', [
            resultLine('Tracer output', 'neutral', 'the box would not decrypt anything — nothing left to trace'),
            resultLine('Security verdict', 'ok', 'a dead decoder is a solved problem'),
          ]),
        )
        return
      }
      const accused = result.accused
      const truthful = traitors.includes(accused)
      const lines = [
        el('h3', { text: 'The accusation' }),
        resultLine('Tracer output', 'neutral', `the box holds subscriber ${subLabel(accused)}’s keys (${result.steps.length} probes)`),
        resultLine(
          'Ground truth',
          truthful ? 'ok' : 'alarm',
          truthful
            ? `CORRECT — you did copy ${subLabel(accused)}’s keys into the box`
            : `WRONG — ${subLabel(accused)} is innocent (you built the box from ${traitors.map(subLabel).join(', ')})`,
        ),
      ]
      const card = verdictCard(truthful ? 'ok' : 'alarm', lines)
      const revokeBtn = el('button', { class: 'primary', type: 'button', id: 'revoke-accused', text: `Revoke ${subLabel(accused)} and rebroadcast` })
      revokeBtn.addEventListener('click', () => void revokeAndRetest(accused))
      card.append(el('div', { class: 'controls-row' }, [revokeBtn]))
      verdictBox.append(card)
    } finally {
      busy = false
      traceBtn.disabled = false
      buildBtn.disabled = false
    }
  }

  async function revokeAndRetest(accused: number): Promise<void> {
    if (!decoder || busy) return
    busy = true
    try {
      revoked.add(accused)
      const { bc } = await encryptBroadcast(lab.master, 'sd', revoked, 'broadcast after revocation')
      const answer = await pirateDecode(decoder, bc, 'greedy', () => 0)
      const alive = answer.output !== null
      const lines = [
        el('h3', { text: `After revoking ${[...revoked].map(subLabel).join(', ')}` }),
        resultLine('Honest subscribers', 'ok', `${N - revoked.size} still decrypt with unchanged keys; header is ${bc.header.length} wraps`),
        resultLine(
          'Pirate box vs new broadcast',
          alive ? 'alarm' : 'ok',
          alive
            ? 'still decrypts — more stolen keys remain inside'
            : 'no header entry addresses any key it holds; nothing unwraps — the box is dead',
        ),
        resultLine(
          'Security verdict',
          alive ? 'warn' : 'ok',
          alive ? 'trace again: probes now treat revoked keys as dead, so the search finds the next traitor' : 'trace-and-revoke complete: every stolen key set found and shut off',
        ),
      ]
      verdictBox.append(verdictCard(alive ? 'warn' : 'ok', lines))
    } finally {
      busy = false
    }
  }
}
