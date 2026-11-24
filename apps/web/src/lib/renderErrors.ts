import type { RootOptions } from 'react-dom/client';

// React's default reporters can print exception messages, component stacks and causes.
function reportRenderError(): void {
  console.error('GhostPay could not render this view.');
}

export const privateRootErrorHandlers = {
  onCaughtError: reportRenderError,
  onUncaughtError: reportRenderError,
  onRecoverableError: reportRenderError,
} satisfies RootOptions;
