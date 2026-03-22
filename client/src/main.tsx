import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/design-tokens.css'
import './styles/global.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')!

// 直接渲染到 root，不额外包装 div
rootElement.className = 'app'
rootElement.style.height = '100vh'
rootElement.style.overflow = 'hidden'

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
