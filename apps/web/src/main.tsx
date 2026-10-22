import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createDefaultServices } from './lib/defaultServices';
import { ServicesContext } from './lib/services';
import { I18nProvider } from './i18n/context';
import './styles/app.css';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <I18nProvider target={document.documentElement}>
      <ServicesContext.Provider value={createDefaultServices()}>
        <App />
      </ServicesContext.Provider>
    </I18nProvider>
  </StrictMode>,
);
