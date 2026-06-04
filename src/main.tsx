import React from 'react'
import ReactDOM from 'react-dom/client'
import './design/tokens.css'
import './app.css'
import './standalone.css'
import { I18nProvider } from './i18n'
import { StandaloneExplorerApp } from './StandaloneExplorerApp'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <StandaloneExplorerApp />
    </I18nProvider>
  </React.StrictMode>,
)
