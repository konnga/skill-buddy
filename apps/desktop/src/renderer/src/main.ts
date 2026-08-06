import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { applyTheme } from './composables/useSettings'
import './assets/main.css'

if (navigator.platform.toLowerCase().includes('mac')) {
  document.documentElement.classList.add('vibrancy')
}

applyTheme()

createApp(App).use(i18n).mount('#app')
