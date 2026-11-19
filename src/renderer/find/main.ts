import './style.css'

const input = document.getElementById('q') as HTMLInputElement | null
const count = document.getElementById('count')
const prev = document.getElementById('prev')
const next = document.getElementById('next')
const closeButton = document.getElementById('close')

if (!input || !count || !prev || !next || !closeButton) throw new Error('查找栏结构不完整')

let timer = 0
// 已经发起过查找的文本：文本变了要先开新会话，没变才是上一个/下一个
let lastQuery = ''

const startNew = (): void => {
  window.clearTimeout(timer)
  lastQuery = input.value
  window.findApi.query(input.value, true, 'new')
}

const step = (forward: boolean): void => {
  window.clearTimeout(timer)
  if (input.value !== lastQuery) {
    startNew()
    return
  }
  window.findApi.query(input.value, forward, 'next')
}

input.addEventListener('input', () => {
  window.clearTimeout(timer)
  // 输入时不要每个按键都搜，稍等一下
  timer = window.setTimeout(startNew, 140)
})

input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    window.findApi.close()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    step(!event.shiftKey)
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    input.select()
  }
})

prev.addEventListener('click', () => step(false))
next.addEventListener('click', () => step(true))
closeButton.addEventListener('click', () => window.findApi.close())

window.findApi.onResult((result) => {
  count.textContent = `${result.active}/${result.matches}`
  count.classList.toggle('none', result.matches === 0)
})

// 打开后直接能打字
input.focus()
input.select()
