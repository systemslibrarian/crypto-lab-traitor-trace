import './style.css'
import { initLab } from './ui/lab'
import { initNaivePanel } from './ui/naive'
import { initCoverPanel } from './ui/cover'
import { initTracePanel } from './ui/trace'
import { initCollusionPanel } from './ui/collusion'

async function main(): Promise<void> {
  const lab = await initLab()
  await initNaivePanel(lab, document.getElementById('naive-app')!)
  await initCoverPanel(lab, document.getElementById('cover-app')!)
  await initTracePanel(lab, document.getElementById('trace-app')!)
  await initCollusionPanel(lab, document.getElementById('collusion-app')!)
}

void main()
