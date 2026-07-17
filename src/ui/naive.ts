/**
 * Exhibit 1 — the two naive baselines, with real key wraps, so the cost of
 * each is counted in genuine AES-256-GCM operations, not asserted.
 */

import { randomBytes } from '../core/bytes'
import { encryptNaivePerRecipient, headerBytes } from '../core/broadcast'
import { csNodeKey } from '../core/cs'
import { aesGcmSeal, sealedSize } from '../core/primitives'
import { leafNode, N } from '../core/tree'
import { el, hexShort, resultLine, subLabel, verdictCard, clear } from './dom'
import type { Lab } from './lab'

const REVOKEE = 6 // subscriber #7

export async function initNaivePanel(lab: Lab, mount: HTMLElement): Promise<void> {
  let revoked = false

  const grid = el('div', { class: 'naive-grid' })
  const cardA = el('div', { class: 'naive-card' })
  const cardB = el('div', { class: 'naive-card' })
  grid.append(cardA, cardB)

  const toggle = el('button', { class: 'primary', type: 'button', id: 'naive-revoke' })
  const controls = el('div', { class: 'controls-row' }, [toggle])
  const summary = el('div', { 'aria-live': 'polite' })

  mount.append(controls, grid, summary)

  toggle.addEventListener('click', () => {
    revoked = !revoked
    void render()
  })

  async function render(): Promise<void> {
    toggle.textContent = revoked
      ? `Restore subscriber ${subLabel(REVOKEE)}`
      : `Revoke subscriber ${subLabel(REVOKEE)}`

    // --- Design A: one shared group key -------------------------------
    clear(cardA)
    cardA.append(
      el('h3', { text: 'Design A — one shared group key' }),
      el('p', {
        class: 'panel-lead',
        text: 'Every subscriber holds the same key, so one wrap serves all sixteen. Tiny header — until someone has to go.',
      }),
    )
    const groupKey = randomBytes(32)
    const sessionWrap = await aesGcmSeal(groupKey, randomBytes(32))
    const stackA = el('div', { class: 'entry-stack' }, [
      el('div', {
        class: 'entry-bar',
        text: `header entry 1/1 · wrap ${hexShort(sessionWrap.ct)} · ${sealedSize(sessionWrap)} B`,
      }),
    ])
    cardA.append(stackA)
    if (revoked) {
      const rekeyStack = el('div', { class: 'entry-stack' })
      const freshGroupKey = randomBytes(32)
      let rekeyBytes = 0
      for (let u = 0; u < N; u++) {
        if (u === REVOKEE) continue
        const personal = await csNodeKey(lab.master, leafNode(u))
        const wrap = await aesGcmSeal(personal, freshGroupKey)
        rekeyBytes += sealedSize(wrap)
        rekeyStack.append(
          el('div', {
            class: 'entry-bar',
            text: `reissue → ${subLabel(u)} · new group key ${hexShort(wrap.ct)}`,
          }),
        )
      }
      cardA.append(
        el('p', {
          text: `${subLabel(REVOKEE)} knows the group key, so locking them out means a fresh group key delivered individually to each of the other 15 subscribers — all 15 wraps below just ran for real:`,
        }),
        rekeyStack,
        resultLine('Keys reissued', 'alarm', `15 of 15 remaining subscribers (${rekeyBytes} B of rekey traffic)`),
      )
    } else {
      cardA.append(resultLine('Keys reissued', 'ok', 'none — nobody has been revoked yet'))
    }

    // --- Design B: one wrap per recipient ------------------------------
    clear(cardB)
    cardB.append(
      el('h3', { text: 'Design B — one wrap per subscriber' }),
      el('p', {
        class: 'panel-lead',
        text: 'Each subscriber has a personal key. Revocation is free: just drop their wrap. But every single broadcast pays for the whole roster.',
      }),
    )
    const revokedSet = new Set(revoked ? [REVOKEE] : [])
    const { bc } = await encryptNaivePerRecipient(lab.master, revokedSet, 'naive baseline payload')
    const stackB = el('div', { class: 'entry-stack' })
    let shown = 0
    for (let u = 0; u < N; u++) {
      if (revokedSet.has(u)) {
        stackB.append(
          el('div', { class: 'entry-bar dud', text: `${subLabel(u)} · revoked — no entry` }),
        )
        continue
      }
      const entry = bc.header[shown++]
      stackB.append(
        el('div', {
          class: 'entry-bar',
          text: `header entry → ${subLabel(u)} · wrap ${hexShort(entry.wrap.ct)}`,
        }),
      )
    }
    cardB.append(
      stackB,
      resultLine(
        'Header size',
        revoked ? 'warn' : 'neutral',
        `${bc.header.length} entries, ${headerBytes(bc)} B — grows one-for-one with the roster, forever`,
      ),
      resultLine('Keys reissued', 'ok', 'none — revocation is just dropping a wrap'),
    )

    // --- The takeaway ---------------------------------------------------
    clear(summary)
    summary.append(
      verdictCard('warn', [
        resultLine('Design A cost', revoked ? 'alarm' : 'neutral', revoked ? 'revocation touched all 15 remaining subscribers' : '1 header entry, but revocation will touch everyone'),
        resultLine('Design B cost', 'neutral', `${revoked ? 15 : 16} header entries on every broadcast`),
        resultLine(
          'The question',
          'warn',
          'can one ciphertext stay small AND revoke without touching anyone? Exhibit 2 says yes.',
        ),
      ]),
    )
  }

  await render()
}
