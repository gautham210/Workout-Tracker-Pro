import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './product.css'
import { AuthProvider } from './context/AuthContext.jsx'
import { isSupabaseConfigured } from './lib/supabase.js'
import ConfigError from './components/ConfigError.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isSupabaseConfigured ? (
      <AuthProvider>
        <App />
      </AuthProvider>
    ) : (
      <ConfigError />
    )}
  </React.StrictMode>,
)
