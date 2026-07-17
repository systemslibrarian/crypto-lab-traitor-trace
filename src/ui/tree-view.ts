/**
 * The 16-leaf tree: SVG for the internal nodes and edges (decorative twin of
 * the accessible controls), real HTML buttons for the 16 leaves. Cover roots
 * get a key mark, SD-excluded nodes a cross — icon + text + color throughout.
 */

import { leavesUnder, isLeaf, left, N, right } from '../core/tree'
import { el, subLabel } from './dom'

const SVGNS = 'http://www.w3.org/2000/svg'
const LEAF_W = 50
const DEPTH_Y = [24, 82, 140, 198]
const BOTTOM_Y = 236

function nodeX(node: number): number {
  const users = leavesUnder(node)
  return ((users[0] + users[users.length - 1]) / 2 + 0.5) * LEAF_W
}

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const n = document.createElementNS(SVGNS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  return n
}

export interface TreeState {
  revoked: ReadonlySet<number>
  /** Tree nodes that are cover-set roots (CS nodes, or SD `i` nodes). */
  coverNodes: ReadonlySet<number>
  /** Tree nodes excluded from an enclosing SD subset (`j` nodes). */
  excludedNodes: ReadonlySet<number>
}

export interface TreeView {
  root: HTMLElement
  setState(state: TreeState): void
}

export function createTreeView(onToggleLeaf: (u: number) => void): TreeView {
  const svg = svgEl('svg', {
    class: 'tree-svg',
    viewBox: `0 0 ${N * LEAF_W} ${BOTTOM_Y + 8}`,
    'aria-hidden': 'true',
    focusable: 'false',
  }) as SVGSVGElement

  // edges first, so nodes draw on top
  for (let i = 1; i < N; i++) {
    const y = DEPTH_Y[Math.floor(Math.log2(i))]
    for (const child of [left(i), right(i)]) {
      const cx = nodeX(child)
      const cy = isLeaf(child) ? BOTTOM_Y : DEPTH_Y[Math.floor(Math.log2(child))]
      svg.append(
        svgEl('line', {
          class: 'edge',
          x1: String(nodeX(i)),
          y1: String(y),
          x2: String(cx),
          y2: String(cy),
        }),
      )
    }
  }

  const nodeGroups = new Map<number, SVGElement>()
  for (let i = 1; i < N; i++) {
    const x = nodeX(i)
    const y = DEPTH_Y[Math.floor(Math.log2(i))]
    const g = svgEl('g', { class: 'node' })
    g.append(svgEl('circle', { cx: String(x), cy: String(y), r: '13' }))
    const label = svgEl('text', { x: String(x), y: String(y + 4) })
    label.textContent = String(i)
    g.append(label)
    const keymark = svgEl('text', { class: 'keymark', x: String(x), y: String(y - 17), 'text-anchor': 'middle' })
    keymark.textContent = '🔑'
    g.append(keymark)
    const exmark = svgEl('text', { class: 'exmark', x: String(x + 17), y: String(y - 10), 'text-anchor': 'middle' })
    exmark.textContent = '✕'
    g.append(exmark)
    svg.append(g)
    nodeGroups.set(i, g)
  }

  const leafButtons: HTMLButtonElement[] = []
  const leafRow = el('div', { class: 'leaf-row' })
  for (let u = 0; u < N; u++) {
    const btn = el('button', {
      type: 'button',
      class: 'leaf-btn',
      id: `tt-leaf-${u}`,
      'aria-pressed': 'false',
    }) as HTMLButtonElement
    btn.append(el('span', { class: 'leaf-ico', 'aria-hidden': 'true', text: '·' }), el('span', { text: subLabel(u) }))
    btn.addEventListener('click', () => onToggleLeaf(u))
    leafButtons.push(btn)
    leafRow.append(btn)
  }

  const legend = el('div', { class: 'tree-legend' }, [
    el('span', { text: '🔑 cover-set root (one wrapped key in the header)' }),
    el('span', { text: '🚫 revoked (click a subscriber to toggle)' }),
    el('span', { text: '✕ carved out of the subset above it (subset difference)' }),
  ])

  const inner = el('div', { class: 'tree-inner' })
  inner.append(svg as unknown as Node, leafRow)
  const scroll = el('div', {
    class: 'tree-scroll',
    tabindex: '0',
    role: 'region',
    'aria-label': 'Subscriber tree: 16 leaf buttons; toggling a subscriber revokes it',
  })
  scroll.append(inner)
  const root = el('div', {})
  root.append(scroll, legend)

  function setState(state: TreeState): void {
    for (let i = 1; i < N; i++) {
      const g = nodeGroups.get(i)!
      g.classList.toggle('cover', state.coverNodes.has(i))
      g.classList.toggle('excluded', state.excludedNodes.has(i))
    }
    for (let u = 0; u < N; u++) {
      const leaf = N + u
      const btn = leafButtons[u]
      const revoked = state.revoked.has(u)
      const covered = state.coverNodes.has(leaf)
      const excluded = state.excludedNodes.has(leaf)
      btn.classList.toggle('revoked', revoked)
      btn.classList.toggle('covered', covered)
      btn.setAttribute('aria-pressed', String(revoked))
      const ico = btn.querySelector('.leaf-ico')!
      ico.textContent = revoked ? '🚫' : covered ? '🔑' : excluded ? '✕' : '·'
      btn.setAttribute(
        'aria-label',
        `Subscriber ${u + 1}: ${revoked ? 'revoked' : 'authorized'}${covered ? ', cover-set root' : ''}`,
      )
    }
  }

  return { root, setState }
}
