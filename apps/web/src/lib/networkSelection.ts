import {
  DEFAULT_WEB_NETWORK_SELECTION, WEB_NETWORK_SELECTION_KEY, isNonDefaultSelection, parseWebNetworkSelection,
  type WebNetworkSelection,
} from '@ghostpay/net-transport/browser';
import { UserFacingError } from './errors';

export type StoredNetworkSelection =
  | { readonly status: 'ready' | 'pending'; readonly selection: WebNetworkSelection }
  | { readonly status: 'invalid' };

/**
 * TM14: absence is the fresh-install default. A present malformed value or unreadable storage is not consent to
 * replace a selected private path with Direct. The pure package parser retains its compatibility fallback; this
 * browser storage boundary rejects malformed input instead of accepting values the parser had to replace.
 */
export function readNetworkSelection(storage?: Pick<Storage, 'getItem'>): StoredNetworkSelection {
  try {
    const text = (storage ?? globalThis.localStorage)?.getItem(WEB_NETWORK_SELECTION_KEY);
    if (text === null || text === undefined) return { status: 'ready', selection: DEFAULT_WEB_NETWORK_SELECTION };
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { status: 'invalid' };
    const selection = parseWebNetworkSelection(raw);
    const fields = selection as unknown as Readonly<Record<string, unknown>>;
    // This v1 browser setting has always saved all four fields. A missing field can be a truncated private policy;
    // never fill it with a weaker default. The package parser remains permissive for other library consumers.
    if (Object.keys(raw).length !== Object.keys(fields).length ||
      Object.entries(raw).some(([key, value]) => !Object.hasOwn(fields, key) || fields[key] !== value)) return { status: 'invalid' };
    return { status: isNonDefaultSelection(selection) && !selection.noticeAcknowledged ? 'pending' : 'ready', selection };
  } catch {
    return { status: 'invalid' };
  }
}

/** Current acknowledged policy for RPC dispatch. Failure messages contain no stored input or endpoint. */
export function loadNetworkSelection(storage?: Pick<Storage, 'getItem'>): WebNetworkSelection {
  const saved = readNetworkSelection(storage);
  if (saved.status === 'invalid') throw new UserFacingError({ key: 'error.network.profileInvalid' });
  if (saved.status === 'pending') throw new UserFacingError({ key: 'error.network.profilePending' });
  return saved.selection;
}

// i18n-use: error.network.profileInvalid error.network.profilePending
