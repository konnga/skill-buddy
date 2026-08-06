import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'

const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = (): void => {
  document.documentElement.classList.toggle('dark', media.matches)
}
applyTheme()
media.addEventListener('change', applyTheme)

createApp(App).mount('#app')
