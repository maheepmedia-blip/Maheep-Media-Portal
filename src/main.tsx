import { registerSW } from 'virtual:pwa-register';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(<App />);
