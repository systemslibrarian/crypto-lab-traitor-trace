/**
 * The 16-leaf tree: SVG for the internal nodes and edges (decorative twin of
 * the accessible controls), real HTML buttons for the 16 leaves. Cover-set
 * SUBTREES light up as tinted regions (SD exclusions painted back out), the
 * cover roots get a key mark, and a selected subscriber's membership chain
 * up to its cover node is highlightable. Icon + text + color throughout; the
 * SVG is aria-hidden and every fact it shows also appears as text nearby.
 */

import { depth, isLeaf, leavesUnder, left, N, right } from '../core/tree'
import { el, subLabel } from './dom'

const SVGNS = 'http://www.w3.org/2000/svg'
const LEAF_W = 50
const DEPTH_Y = [24, 82, 140, 198]
const BOTTOM_Y = 236

function nodeX(node: number): number {
  const users = leavesUnder(node)
  return ((users[0] + users[users.length - 1]) / 2 + 0.5) * LEAF_W
}

function nodeY(node: number): number {
  return isLeaf(node) ? BOTTOM_Y : DEPTH_Y[depth(node)]
}

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const n = document.createElementNS(SVGNS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  return n
}

/** One cover subset in either method: CS = {i, j: null}, SD = {i, j}. */
export interface CoverSubset {
  i: number
  j: number | null
}

export interface TreeState {
  revoked: ReadonlySet<number>
  subsets: readonly CoverSubset[]
}

export interface TreeView {
  root: HTMLElement
  setState(state: TreeState): void
  /** Highlight a membership chain [leafNode, ..., coverNode]; null clears. */
  setFocus(path: readonly number[] | null): void
}

export function createTreeView(onToggleLeaf: (u: number) => void): TreeView {
  const svg = svgEl('svg', {
    class: 'tree-svg',
    viewBox: `0 0 ${N * LEAF_W} ${BOTTOM_Y + 8}`,
    'aria-hidden': 'true',
    focusable: 'false',
  }) as SVGSVGElement

  // subtree regions live behind everything else
  const regionLayer = svgEl('g', {})
  svg.append(regionLayer)

  // edges next, keyed by their child node so a path can light them up
  const edges = new Map<number, SVGElement>()
  for (let i = 1; i < N; i++) {
    for (const child of [left(i), right(i)]) {
      const line = svgEl('line', {
        class: 'edge',
        x1: String(nodeX(i)),
        y1: String(nodeY(i)),
        x2: String(nodeX(child)),
        y2: String(nodeY(child)),
      })
      edges.set(child, line)
      svg.append(line)
    }
  }

  const nodeGroups = new Map<number, SVGElement>()
  for (let i = 1; i < N; i++) {
    const x = nodeX(i)
    const y = nodeY(i)
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
    el('span', { text: 'tinted block = one cover subset (all its leaves share one wrapped key)' }),
    el('span', { text: '🔑 cover-set root' }),
    el('span', { text: '🚫 revoked (click a subscriber to toggle)' }),
    el('span', { text: '✕ carved out of the tinted subset around it (subset difference)' }),
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

  function regionRect(node: number, cls: string): SVGElement {
    const users = leavesUnder(node)
    const x = users[0] * LEAF_W + 3
    const w = users.length * LEAF_W - 6
    const y = nodeY(node) - 18
    return svgEl('rect', {
      class: cls,
      x: String(x),
      y: String(y),
      width: String(w),
      height: String(BOTTOM_Y + 6 - y),
      rx: '9',
    })
  }

  function setState(state: TreeState): void {
    // regions: outer subsets first so nested inner subsets paint over the
    // cuts that contain them (e.g. S(1∖4) with S(8∖16) inside node 4)
    regionLayer.replaceChildren()
    const ordered = [...state.subsets].sort((a, b) => depth(a.i) - depth(b.i))
    for (const s of ordered) {
      regionLayer.append(regionRect(s.i, 'region'))
      if (s.j !== null) regionLayer.append(regionRect(s.j, 'region-cut'))
    }

    const coverNodes = new Set(state.subsets.map((s) => s.i))
    const excludedNodes = new Set(state.subsets.flatMap((s) => (s.j === null ? [] : [s.j])))
    for (let i = 1; i < N; i++) {
      const g = nodeGroups.get(i)!
      g.classList.toggle('cover', coverNodes.has(i))
      g.classList.toggle('excluded', excludedNodes.has(i))
    }
    for (let u = 0; u < N; u++) {
      const leaf = N + u
      const btn = leafButtons[u]
      const revoked = state.revoked.has(u)
      const covered = coverNodes.has(leaf)
      const excluded = excludedNodes.has(leaf)
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

  function setFocus(path: readonly number[] | null): void {
    for (const line of edges.values()) line.classList.remove('hot')
    for (const g of nodeGroups.values()) g.classList.remove('hot')
    for (const btn of leafButtons) btn.classList.remove('hot')
    if (!path || path.length === 0) return
    // path runs leaf -> cover node; light each hop's edge and every node on it
    for (let k = 0; k + 1 < path.length; k++) edges.get(path[k])?.classList.add('hot')
    for (const node of path) {
      if (isLeaf(node)) leafButtons[node - N].classList.add('hot')
      else nodeGroups.get(node)?.classList.add('hot')
    }
  }

  return { root, setState, setFocus }
}
