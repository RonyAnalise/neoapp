import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/push-sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[PWA] Service Worker registrado com sucesso! Escopo:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Erro ao registrar Service Worker:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
