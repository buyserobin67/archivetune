import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { backfillTags } from './lib/backfill';
import { getPlayer } from './lib/player';
import { registerServiceWorker } from './lib/pwa';
import { requestPersistence } from './lib/storage';
import './index.css';

// Create the one audio element up front, outside React, then restore the last queue (paused).
const player = getPlayer();
void player.restore().catch(() => {});
void requestPersistence();
// Read genre / embedded-lyric tags for tracks imported before those existed (background, a few at a time).
setTimeout(() => void backfillTags().catch(() => {}), 3000);
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
