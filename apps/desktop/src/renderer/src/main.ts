import { createApp } from 'vue'
import App from './App.vue'
import { applyTheme } from './composables/useSettings'
import './assets/main.css'

applyTheme()

createApp(App).mount('#app')
