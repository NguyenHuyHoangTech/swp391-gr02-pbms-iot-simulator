/**
 * @Author: Nguyen Huu Thanh (Member 5)
 * @Date: 2026-07-21
 * @Description: Entry point khởi tạo React root và render component App gốc
 * của ứng dụng IoT Simulator.
 * @Dependencies:
 * - react-dom/client
 * - App (Local)
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
