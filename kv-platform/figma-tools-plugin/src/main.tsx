import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

function showFatal(message: string) {
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  pre.style.fontSize = '12px';
  pre.style.padding = '12px';
  pre.textContent = message;
  const container = document.body || document.documentElement;
  container.appendChild(pre);
}

function waitForRoot(maxFrames = 120) {
  return new Promise<HTMLElement | null>((resolve) => {
    let frames = 0;
    const tick = () => {
      const root = document.getElementById('root');
      if (root) return resolve(root as HTMLElement);
      frames++;
      if (frames >= maxFrames) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

void (async () => {
  const rootEl = await waitForRoot();
  if (!rootEl) {
    showFatal('Plugin UI failed: #root not found');
    return;
  }

  rootEl.textContent = 'Loading…';
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack || ''}` : String(e);
    showFatal(`Plugin UI crashed:\n${msg}`);
    try {
      rootEl.remove();
    } catch (e2) {
      void e2;
    }
  }
})();
