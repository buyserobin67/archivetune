import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Boot } from './Boot';
import { getPlayer } from './lib/player';
import './index.css';

// Create the one audio element up front, outside React. Everything that needs the library starts after it has opened (Boot).
getPlayer();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Boot />
    </HashRouter>
  </StrictMode>,
);
