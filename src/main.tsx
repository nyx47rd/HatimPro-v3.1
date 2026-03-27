import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/400-italic.css';
import '@fontsource/libre-baskerville/700.css';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/amiri-quran/400.css';
import '@fontsource/scheherazade-new/400.css';
import '@fontsource/scheherazade-new/500.css';
import '@fontsource/scheherazade-new/600.css';
import '@fontsource/scheherazade-new/700.css';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import {AuthProvider} from './contexts/AuthContext';

// Global Error Handler for Chunk Loading Issues
window.addEventListener('error', (e) => {
  const msg = (e.message || '').toLowerCase();
  if (msg.includes('chunk') || msg.includes('loading') || msg.includes('script error')) {
    console.warn('Chunk error detected in main.tsx, reloading...');
    window.location.reload();
  }
}, true);

window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && e.reason.message || '').toLowerCase();
  if (msg.includes('chunk')) {
    console.warn('Unhandled chunk rejection in main.tsx, reloading...');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* @ts-ignore */}
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
