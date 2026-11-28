import { StrictMode } from 'react';
import { createRoot, type RootOptions } from 'react-dom/client';
import { App } from './App';
import { createDefaultServices } from './lib/defaultServices';
import { ServicesContext } from './lib/services';
import { I18nProvider } from './i18n/context';
import { MirrorNoticeLanguage } from './i18n/MirrorNoticeLanguage';
import './styles/app.css';

/**
 * Root error reporting (SEC-42 / E-19). React's defaults log a render error with its message and component stack, which
 * can carry what the user typed (key hex, passphrases, addresses). These handlers log one fixed line naming only the
 * error class; the message, stack, component stack and any other value of the error never reach the console. The
 * views' ErrorBoundary still renders the localized error panel.
 */
export function rootErrorClass(error: unknown): string {
  // Error.name is mutable and can contain secrets or a throwing getter. Return only fixed labels; never read it.
  // A Proxy can also throw during instanceof's prototype inspection, so classification must fail safely.
  try {
    if (error instanceof TypeError) return 'TypeError';
    if (error instanceof RangeError) return 'RangeError';
    if (error instanceof ReferenceError) return 'ReferenceError';
    if (error instanceof SyntaxError) return 'SyntaxError';
    if (error instanceof URIError) return 'URIError';
    if (error instanceof EvalError) return 'EvalError';
    if (error instanceof AggregateError) return 'AggregateError';
  } catch { /* Reporting an error must not expose or rethrow the original value. */ }
  return 'Error';
}
const report = (kind: string) => (error: unknown): void => {
  console.error(`GhostPay: ${kind} render error (${rootErrorClass(error)})`);
};
export const ROOT_ERROR_HANDLERS: Pick<RootOptions, 'onCaughtError' | 'onUncaughtError' | 'onRecoverableError'> = Object.freeze({
  onCaughtError: report('caught'),
  onUncaughtError: report('uncaught'),
  onRecoverableError: report('recoverable'),
});

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');
createRoot(root, ROOT_ERROR_HANDLERS).render(
  <StrictMode>
    <I18nProvider target={document.documentElement}>
      <MirrorNoticeLanguage />
      <ServicesContext.Provider value={createDefaultServices()}>
        <App />
      </ServicesContext.Provider>
    </I18nProvider>
  </StrictMode>,
);
