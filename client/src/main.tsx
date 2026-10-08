import { MotionConfig, MotionGlobalConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Dev-only: `?instant` skips animations (handy for screenshots and slow devices while testing).
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('instant')) {
  MotionGlobalConfig.instantAnimations = true;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
