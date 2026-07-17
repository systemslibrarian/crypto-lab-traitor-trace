/**
 * Exhibit 2 — the subset cover. Every click recomputes the real cover, runs
 * a real AES-256-GCM broadcast, and tests all sixteen decoders against it.
 */

import {
  encryptBroadcast,
  subscriberDecrypt,
  type Broadcast,
  type DecryptReport,
  type Method,
} from '../core/broadcast'
import { csCover } from '../core/cs'
import { sdCover } from '../core/sd'
import { aesGcmOpen, sealedSize } from '../core/primitives'
import { leafNode, leavesUnder, N, ROOT } from '../core/tree'
import { el, hexShort, resultLine, subLabel, verdictCard, clear } from './dom'
import { rangeLabel, type Lab } from './lab'
import { createTreeView } from './tree-view'

function describeCsNode(node: number): string {
  if (node === ROOT) return 'everyone (whole tree)'
  return `node ${node} → ${rangeLabel(leavesUnder(node))}`
}

function describeSdSubset(i: number, j: number | null): string {
  if (j === null) return 'everyone (no exclusions)'
  return `S(${i} ∖ ${j}) → ${rangeLabel(leavesUnder(i))} except ${rangeLabel(leavesUnder(j))}`
}

export async function initCoverPanel(lab: Lab, mount: HTMLElement): Promise<void> {
  let method: Method = 'sd'
  const revoked = new Set<number>()
  let message = 'This month’s licensed-content session key is inside.'
  let selected: number | null = null
  let lastBroadcast: Broadcast | null = null
  let lastReports: DecryptReport[] = []
  let runToken = 0

  const tree = createTreeView((u) => {
    if (revoked.has(u)) revoked.delete(u)
    else revoked.add(u)
    void refresh()
  })

  // --- controls -------------------------------------------------------
  const methodSet = el('fieldset', {}, [el('legend', { text: 'Cover method' })])
  for (const [value, label] of [
    ['sd', 'Subset difference (SD) — ≤ 2r−1 wraps'],
    ['cs', 'Complete subtree (CS) — ≤ r·log(N/r) wraps'],
  ] as const) {
    const input = el('input', { type: 'radio', name: 'cover-method', value, id: `method-${value}` }) as HTMLInputElement
    input.checked = value === method
    input.addEventListener('change', () => {
      method = value
      void refresh()
    })
    methodSet.append(el('label', { for: `method-${value}` }, [input, ` ${label}`]))
    methodSet.append(el('span', { text: ' ' }))
  }

  const presetBtn = el('button', { type: 'button', id: 'cover-preset', text: 'Revoke #7 + #12' })
  presetBtn.addEventListener('click', () => {
    revoked.clear()
    revoked.add(6)
    revoked.add(11)
    void refresh()
  })
  const clearBtn = el('button', { type: 'button', id: 'cover-clear', text: 'Restore everyone' })
  clearBtn.addEventListener('click', () => {
    revoked.clear()
    void refresh()
  })

  const msgInput = el('input', { type: 'text', id: 'cover-msg', maxlength: '120' }) as HTMLInputElement
  msgInput.value = message
  msgInput.addEventListener('change', () => {
    message = msgInput.value || 'empty message'
    void refresh()
  })

  const controls = el('div', { class: 'controls-row' }, [
    methodSet,
    presetBtn,
    clearBtn,
    el('label', { for: 'cover-msg', text: 'Broadcast message:' }),
    msgInput,
  ])

  // --- results --------------------------------------------------------
  const coverStatus = el('div', { role: 'status', 'aria-live': 'polite' })
  const headerCol = el('div', {})
  const decodersCol = el('div', {})
  const columns = el('div', { class: 'cover-columns' }, [headerCol, decodersCol])

  mount.append(controls, tree.root, coverStatus, columns)

  mount.insertAdjacentHTML(
    'beforeend',
    `
    <details class="expert"><summary>Where the keys come from (and why receivers are stateless)</summary>
      <p>The center owns one 32-byte master seed. Complete-subtree keys are
      <code>HKDF-SHA-256(seed, "cs-node/i")</code>, one per tree node; subscriber <em>u</em> is handed the
      5 keys on its leaf-to-root path at setup and never contacted again. Subset-difference keys come
      from a GGM construction: each internal node <em>i</em> has an initial label, walking to a child
      applies <code>HMAC-SHA-256(label, "left"/"right")</code>, and the key of S(i ∖ j) is
      <code>HMAC-SHA-256(label at j, "key")</code>. Subscriber <em>u</em> stores the 10 labels hanging
      off its path — enough to derive the key of every subset that contains it and provably none that
      exclude it. Revocation never touches any of this: it only changes which subset keys the
      <em>header</em> uses.</p>
    </details>
    <details class="expert"><summary>Why the SD cover needs at most 2r−1 wraps</summary>
      <p>The cover algorithm repeatedly merges the two revoked leaves whose meeting point is deepest,
      emitting at most two subsets per merge, then one more for the root. With r revoked leaves there
      are r−1 merges plus the final step: at most 2(r−1)+1 = 2r−1 subsets — independent of N. The
      complete-subtree method pays up to r·log₂(N/r) instead; the naive baseline pays N−r. Watch all
      three numbers in the table as you click.</p>
    </details>
    <details class="expert"><summary>The header format on the wire</summary>
      <p>Each header entry is a subset identifier plus AES-256-GCM(subset key, session key):
      12-byte IV + 32-byte wrapped key + 16-byte tag = 60 bytes. The payload is encrypted once under
      the session key. A receiver finds the one entry whose subset contains it, unwraps, and opens
      the payload; GCM's authentication tag is what slams the door on everyone else.</p>
    </details>`,
  )

  async function refresh(): Promise<void> {
    const token = ++runToken
    const cs = csCover(revoked)
    const sd = sdCover(revoked)
    const coverNodes = new Set<number>(method === 'cs' ? cs : sd.map((s) => s.i))
    const excludedNodes = new Set<number>()
    if (method === 'sd') for (const s of sd) if (s.j !== null) excludedNodes.add(s.j)
    tree.setState({ revoked, coverNodes, excludedNodes })

    const { bc } = await encryptBroadcast(lab.master, method, revoked, message)
    const reports: DecryptReport[] = []
    for (const ring of lab.rings) reports.push(await subscriberDecrypt(ring, bc))
    if (token !== runToken) return // a newer click superseded this run
    lastBroadcast = bc
    lastReports = reports

    // headline numbers
    clear(coverStatus)
    const r = revoked.size
    const naiveCount = N - r
    const active = method === 'cs' ? cs.length : sd.length
    coverStatus.append(
      verdictCard(r > 0 ? 'ok' : 'warn', [
        resultLine(
          'Cover computed',
          'neutral',
          method === 'cs'
            ? cs.map(describeCsNode).join('; ') || 'empty (everyone revoked)'
            : sd.map((s) => describeSdSubset(s.i, s.j)).join('; ') || 'empty (everyone revoked)',
        ),
        resultLine(
          'Header size',
          'ok',
          `${active} wrapped ${active === 1 ? 'key' : 'keys'} instead of ${naiveCount} per-recipient wraps — with ${r} revoked`,
        ),
        resultLine('Keys reissued by this revocation', 'ok', '0 — every remaining subscriber decrypts with a key it has held since setup'),
      ]),
    )

    // header entries
    clear(headerCol)
    headerCol.append(el('h3', { text: `The broadcast header (${method === 'cs' ? 'complete subtree' : 'subset difference'})` }))
    const list = el('ul', { class: 'header-list' })
    bc.header.forEach((entry, idx) => {
      const desc =
        entry.subset.kind === 'cs'
          ? describeCsNode(entry.subset.node)
          : describeSdSubset(entry.subset.i, entry.subset.j)
      const li = el('li', {})
      li.append(
        `${idx + 1}. ${desc} · `,
        el('span', { class: 'hexchip', text: `wrap ${hexShort(entry.wrap.ct)} (${sealedSize(entry.wrap)} B)` }),
      )
      list.append(li)
    })
    if (bc.header.length === 0) list.append(el('li', { text: 'No entries — everyone is revoked, nobody can decrypt.' }))
    headerCol.append(list)

    const table = el('table', { class: 'stat-table' })
    table.append(
      el('caption', { class: 'visually-hidden', text: 'Header entries required by each method for the current revocation set' }),
      el('thead', {}, [
        el('tr', {}, [
          el('th', { scope: 'col', text: 'Method' }),
          el('th', { scope: 'col', text: 'Header entries' }),
          el('th', { scope: 'col', text: 'Bytes' }),
        ]),
      ]),
      el('tbody', {}, [
        el('tr', {}, [el('th', { scope: 'row', text: 'Naive per-recipient' }), el('td', { class: 'num', text: String(naiveCount) }), el('td', { class: 'num', text: String(naiveCount * 60) })]),
        el('tr', {}, [el('th', { scope: 'row', text: 'Complete subtree' }), el('td', { class: 'num', text: String(cs.length) }), el('td', { class: 'num', text: String(cs.length * 60) })]),
        el('tr', {}, [el('th', { scope: 'row', text: 'Subset difference' }), el('td', { class: 'num', text: String(sd.length) }), el('td', { class: 'num', text: String(sd.length * 60) })]),
      ]),
    )
    headerCol.append(table)

    // decoder grid
    clear(decodersCol)
    decodersCol.append(
      el('h3', { text: 'All sixteen decoders vs. the real ciphertext' }),
      el('p', {
        class: 'panel-lead',
        text: 'Each cell just ran a genuine decryption attempt. Pick a subscriber for the step-by-step verdict.',
      }),
    )
    const grid = el('div', { class: 'subscriber-grid' })
    reports.forEach((rep) => {
      const isRevoked = revoked.has(rep.u)
      const btn = el('button', { type: 'button', class: 'sub-cell', id: `sub-cell-${rep.u}` })
      btn.classList.toggle('is-ok', rep.opened)
      btn.classList.toggle('is-locked', !rep.opened)
      btn.append(
        el('span', { class: 'sub-ico', 'aria-hidden': 'true', text: rep.opened ? '✓' : '🔒' }),
        el('span', { text: subLabel(rep.u) }),
      )
      btn.setAttribute(
        'aria-label',
        `Subscriber ${rep.u + 1}: ${rep.opened ? 'decrypted the broadcast' : isRevoked ? 'revoked, locked out' : 'could not decrypt'}`,
      )
      btn.addEventListener('click', () => {
        selected = rep.u
        void renderDetail()
      })
      grid.append(btn)
    })
    decodersCol.append(grid)
    decodersCol.append(detailBox)
    await renderDetail()
  }

  const detailBox = el('div', { role: 'status', 'aria-live': 'polite', id: 'sub-detail' })

  async function renderDetail(): Promise<void> {
    clear(detailBox)
    if (selected === null || lastBroadcast === null) {
      detailBox.append(el('p', { class: 'panel-lead', text: 'No subscriber selected yet.' }))
      return
    }
    const rep = lastReports[selected]
    const isRevoked = revoked.has(selected)
    const lines: HTMLElement[] = [el('h3', { text: `Subscriber ${subLabel(selected)} — what actually happened` })]
    if (rep.entryIndex === null) {
      lines.push(
        resultLine('Header scan', 'neutral', `no entry among ${lastBroadcast.header.length} covers this subscriber — every subset key derivation fails closed`),
      )
      if (lastBroadcast.header.length > 0) {
        // Force the attempt anyway: real AES-GCM, wrong key, tag says no.
        const ownLeafKey = lab.rings[selected].cs.get(leafNode(selected))!
        const forced = await aesGcmOpen(ownLeafKey, lastBroadcast.header[0].wrap)
        lines.push(
          resultLine(
            'AES-GCM, forced anyway',
            'neutral',
            forced === null
              ? `tried ${subLabel(selected)}’s own key on header entry 1 just now — authentication tag rejected it`
              : 'unwrapped (this would be a bug)',
          ),
        )
      }
    } else {
      lines.push(
        resultLine('Header scan', 'neutral', `entry ${rep.entryIndex + 1} covers this subscriber — exactly one, as the cover guarantees`),
        resultLine('AES-GCM key unwrap', rep.unwrapOk ? 'ok' : 'alarm', rep.unwrapOk ? 'tag verified, session key recovered' : 'authentication failed'),
        resultLine('AES-GCM payload', rep.opened ? 'ok' : 'alarm', rep.opened ? `opened: “${rep.plaintext}”` : 'authentication failed'),
      )
    }
    // The security verdict is a SEPARATE judgment: did the system behave correctly?
    const integrityHolds = rep.opened !== isRevoked
    lines.push(
      resultLine(
        'Security verdict',
        integrityHolds ? 'ok' : 'alarm',
        isRevoked
          ? integrityHolds
            ? 'LOCKED OUT — revocation holding, exactly as intended'
            : 'BREACH — a revoked subscriber decrypted; the system failed'
          : integrityHolds
            ? 'AUTHORIZED — decryption succeeded for a paying subscriber'
            : 'OUTAGE — an authorized subscriber was wrongly locked out',
      ),
      resultLine('Key ring', 'ok', `fingerprint ${lab.fingerprints[selected]} — identical since setup; no revocation ever rewrote it`),
    )
    detailBox.append(verdictCard(integrityHolds ? 'ok' : 'alarm', lines))
  }

  await refresh()
}
