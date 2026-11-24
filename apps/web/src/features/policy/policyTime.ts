const MAX_DATE_SECONDS = 8_640_000_000_000n;

/** Chain timestamps can exceed Date's range. Preserve the exact value without crashing recovery controls. */
export function formatPolicyTimestamp(seconds: bigint): string {
  if (seconds < -MAX_DATE_SECONDS || seconds > MAX_DATE_SECONDS) return `${seconds.toString()} s (Unix)`;
  return new Date(Number(seconds) * 1000).toISOString();
}
