import type { RetentionDays, TimestampCategory } from '@ghostpay/ux-vault/portable';

export const policyKey = (category: TimestampCategory): string => `ghostpay.retention.${category}.days.v1`;
export const POLICY_CHANGE_EVENT = 'ghostpay:timestamp-retention-days';

export function parseRetentionDays(raw: string): RetentionDays | undefined {
  if (raw === '0') return 0;
  if (raw === '30') return 30;
  if (raw === '90') return 90;
  return undefined;
}

/** No consent or plan persists. Days constrain the next explicitly confirmed cleanup. */
export function readRetentionDays(category: TimestampCategory): RetentionDays | undefined {
  try {
    const raw = localStorage.getItem(policyKey(category));
    return raw === null ? 0 : parseRetentionDays(raw);
  } catch { return undefined; }
}

export function saveRetentionDays(category: TimestampCategory, days: RetentionDays): boolean {
  try {
    localStorage.setItem(policyKey(category), String(days));
    window.dispatchEvent(new Event(POLICY_CHANGE_EVENT));
    return readRetentionDays(category) === days;
  } catch { return false; }
}
