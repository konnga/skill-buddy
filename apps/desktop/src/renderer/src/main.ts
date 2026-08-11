import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { applyTheme } from './composables/useSettings'
import './assets/main.css'

// vibrancy class 由 applyTheme → applyAppearance 按平台与用户设置统一控制
applyTheme()

createApp(App).use(i18n).mount('#app')
