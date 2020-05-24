import { h, createApp } from '@vue/runtime-dom'

// 在屏幕上渲染内容所需的最低代码
createApp({
  render: () => h('div', 'hello world!')
}).mount('#app')
