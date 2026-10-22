import type { FragmentVerification, VerifyOptions } from './verify.js';
import { verifyFragment } from './verify.js';
import type { GhostPayClient } from './client.js';
import type { SdkEvent } from './events.js';

/**
 * The subset of React the hooks need. Pass the real `React` object; this package never
 * imports `react`, so it adds no dependency and works with any compatible runtime (Preact compat).
 */
export interface ReactLike {
  useState: <S>(initial: S | (() => S)) => [S, (value: S | ((prev: S) => S)) => void];
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
}

export type VerdictState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'done'; readonly result: FragmentVerification };

export interface ReactHooks {
  /**
   * Verifies a fragment (typically `location.hash`) whenever it or the policy inputs change.
   * `null` means idle. Stale async results are discarded; the fragment is never logged or sent anywhere.
   */
  useInvoiceVerdict: (fragment: string | null, options: VerifyOptions) => VerdictState;
  /** Subscribes to a client's local events for the component's lifetime. */
  useGhostPayEvents: (client: GhostPayClient, handler: (event: SdkEvent) => void) => void;
}

/**
 * Creates React hooks bound to the supplied React.
 *
 * @param React Real React (or a compatible subset).
 * @security `useInvoiceVerdict` re-runs on `nowSeconds` changes, so supply a coarse (e.g. per-second) clock
 * value from state rather than `Date.now()` on every render, or it will re-verify each render.
 */
export function createReactHooks(React: ReactLike): ReactHooks {
  return {
    useInvoiceVerdict(fragment, options) {
      const [state, setState] = React.useState<VerdictState>({ status: 'idle' });
      const pinKey = options.pinnedSigners?.join(',') ?? '';
      React.useEffect(() => {
        if (fragment === null) {
          setState({ status: 'idle' });
          return undefined;
        }
        let cancelled = false;
        setState({ status: 'loading' });
        void verifyFragment(fragment, options).then(
          (result) => {
            if (!cancelled) setState({ status: 'done', result });
          },
          () => {
            if (!cancelled) setState({ status: 'done', result: { parsed: false, invoiceCode: 'UNKNOWN', verdict: undefined } });
          },
        );
        return () => {
          cancelled = true;
        };
      }, [fragment, options.nowSeconds, options.expectedChainId, options.mode, pinKey]);
      return state;
    },
    useGhostPayEvents(client, handler) {
      React.useEffect(() => client.on(handler), [client, handler]);
    },
  };
}
