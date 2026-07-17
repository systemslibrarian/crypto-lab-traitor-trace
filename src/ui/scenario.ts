/**
 * Shareable, deterministic scenario state, serialized in the URL hash so a
 * lecture slide or bug report can link the exact configuration under
 * discussion: #m=sd&r=7,12&s=1&t=12&ca=4&cb=13&st=evasive&seed=123456
 *
 * Keys (all human-facing numbers 1-indexed):
 *   m    cover method (cs|sd)              s    selected subscriber
 *   r    revoked subscribers, comma list   t    decoder key sets (Exhibit 3)
 *   ca/cb collusion traitors               st   collusion strategy
 *   seed collusion PRNG seed (reproduces the histogram exactly)
 *
 * Theme is deliberately NOT encoded: the shared fleet top bar owns the theme
 * contract (localStorage + toggle), and a URL override would fight it.
 */

const state = new URLSearchParams(location.hash.replace(/^#/, ''))

export function scenarioGet(key: string): string | null {
  return state.get(key)
}

/** Parse a 1-indexed subscriber list like "7,12" into internal 0..15 indices. */
export function scenarioSubscribers(key: string): number[] {
  const raw = scenarioGet(key)
  if (!raw) return []
  return [...new Set(
    raw
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10) - 1)
      .filter((u) => Number.isInteger(u) && u >= 0 && u < 16),
  )]
}

/** Merge keys into the hash (null deletes). Uses replaceState: no history spam. */
export function scenarioSet(entries: Record<string, string | null>): void {
  for (const [k, v] of Object.entries(entries)) {
    if (v === null || v === '') state.delete(k)
    else state.set(k, v)
  }
  const hash = state.toString()
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search)
}

/** The copy-link control; feedback lands in an aria-live status span. */
export function createCopyLinkControl(): HTMLElement {
  const wrap = document.createElement('span')
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.id = 'copy-scenario'
  btn.textContent = '🔗 Copy scenario link'
  const status = document.createElement('span')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.className = 'copy-status'
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      status.textContent = ' ✓ copied — the link reopens this exact scenario'
    } catch {
      status.textContent = ` copy failed — the address bar URL is the link`
    }
  })
  wrap.append(btn, status)
  return wrap
}
