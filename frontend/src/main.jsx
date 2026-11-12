/**
 * Main Entry Point - Church Planting Map Application
 * 
 * Provider hierarchy:
 * 1. QueryClientProvider - React Query for data fetching
 * 2. BrowserRouter - React Router for navigation
 * 3. LanguageProvider - i18n support
 * 4. AuthProvider - Authentication state
 * 5. CountryProvider - Global country selection (NEW)
 * 
 * @author Church Planting Map Team
 * @version 2.0.0
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { CountryProvider } from './context/CountryContext'
import { LanguageProvider } from './i18n'
import 'leaflet/dist/leaflet.css'
import './index.css'

// Global theme init (belt-and-suspenders): apply the saved theme on the <html>
// element before the app paints so dark mode persists app-wide across routes.
try {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
} catch (e) { /* noop */ }

// Configure React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
            <CountryProvider>
              <App />
              <Toaster 
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#fff',
                    color: '#333',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                  },
                }}
              />
            </CountryProvider>
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)