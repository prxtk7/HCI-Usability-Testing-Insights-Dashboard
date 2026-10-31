import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getBrowserStorage } from './lib/storage';
import { createStudyStore } from './lib/studyStore';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found in index.html');

// Created once, outside React, so saved data is loaded exactly one time.
const store = createStudyStore(getBrowserStorage());

createRoot(root).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
