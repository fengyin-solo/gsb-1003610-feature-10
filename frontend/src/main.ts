import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
// 侧效导入：注册无人机核查队列等模块钩子（含火情报告结论回填），保证任意入口都生效。
import '@/api/drone-service'
import './styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
