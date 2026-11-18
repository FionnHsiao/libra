import type { OverlayItem } from '../../shared/protocol'
import './style.css'

const cardElement = document.getElementById('card')
if (!cardElement) throw new Error('missing card')
const card: HTMLDivElement = cardElement as HTMLDivElement

function render(items: OverlayItem[], width: number): void {
  card.style.width = `${width}px`
  card.textContent = ''

  for (const item of items) {
    if (item.separator) {
      const line = document.createElement('div')
      line.className = 'separator'
      card.appendChild(line)
      continue
    }

    const row = document.createElement('div')
    row.className = item.disabled ? 'row disabled' : 'row'

    const main = document.createElement('button')
    main.type = 'button'
    main.className = 'item'
    main.disabled = item.disabled === true

    const check = document.createElement('span')
    check.className = 'check'
    check.textContent = item.checked ? '✓' : ''
    main.appendChild(check)

    const label = document.createElement('span')
    label.className = 'label'
    label.textContent = item.label ?? ''
    main.appendChild(label)

    if (item.accelerator) {
      const accel = document.createElement('span')
      accel.className = 'accel'
      accel.textContent = item.accelerator
      main.appendChild(accel)
    }

    main.addEventListener('click', () => window.overlayApi.select(item.id))
    row.appendChild(main)

    if (item.secondary) {
      const secondary = document.createElement('button')
      secondary.type = 'button'
      secondary.className = 'secondary'
      secondary.textContent = item.secondary.label
      secondary.title = item.secondary.label
      secondary.addEventListener('click', (event) => {
        event.stopPropagation()
        window.overlayApi.select(item.secondary?.id ?? '')
      })
      row.appendChild(secondary)
    }

    card.appendChild(row)
  }

  requestAnimationFrame(() => {
    window.overlayApi.measure(card.offsetHeight)
  })
}

window.overlayApi.onData((payload) => {
  render(payload.items, payload.width)
})

document.addEventListener('mousedown', (event) => {
  if (!card.contains(event.target as Node)) window.overlayApi.close()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.overlayApi.close()
})

window.overlayApi.ready()