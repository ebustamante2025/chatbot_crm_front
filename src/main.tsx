import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initCrmTheme } from './crmTheme'
import './index.css'

initCrmTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
