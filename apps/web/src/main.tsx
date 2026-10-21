import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createDefaultServices } from './lib/defaultServices';
import { ServicesContext } from './lib/services';
import './styles/app.css';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <ServicesContext.Provider value={createDefaultServices()}>
      <App />
    </ServicesContext.Provider>
  </StrictMode>,
);
