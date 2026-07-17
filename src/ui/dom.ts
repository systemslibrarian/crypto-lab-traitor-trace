/** Tiny DOM helpers. State is always icon + text + color, never color alone. */

import { toHex } from '../core/bytes'

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  for (const c of children) node.append(c)
  return node
}

export function hexShort(bytes: Uint8Array, n = 6): string {
  const hex = toHex(bytes.subarray(0, n))
  return `${hex}…`
}

/** 1-indexed display name for subscriber u (internal 0..15). */
export function subLabel(u: number): string {
  return `#${u + 1}`
}

export type Status = 'ok' | 'alarm' | 'warn' | 'neutral'

const ICONS: Record<Status, string> = { ok: '✓', alarm: '✗', warn: '⚠', neutral: '·' }

/**
 * One labeled result row. The cryptographic result and the security verdict
 * are always rendered as SEPARATE lines built from this helper — the point
 * of the lab is that they can disagree.
 */
export function resultLine(label: string, status: Status, text: string): HTMLElement {
  return el('div', { class: 'result-line' }, [
    el('span', { class: 'result-label', text: label }),
    el('span', { class: `status-${status}`, text: `${ICONS[status]} ${text}` }),
  ])
}

export function verdictCard(
  kind: 'ok' | 'alarm' | 'warn',
  lines: HTMLElement[],
): HTMLElement {
  return el('div', { class: `verdict-card is-${kind}` }, lines)
}

export function clear(node: HTMLElement): void {
  node.replaceChildren()
}

export const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function pause(ms: number): Promise<void> {
  if (reducedMotion()) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
