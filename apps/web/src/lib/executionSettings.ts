import type { Settings } from './settings';

/**
 * Only these two new presentation preferences are outside existing execution authority. Every other own field,
 * including future fields, remains part of the comparison. Retain reference checks for RPC maps and signer lists:
 * reparsing, replacement or an external settings write still requires the existing conservative revalidation.
 */
export function sameExecutionSettings(left: Settings, right: Settings): boolean {
  const fields = (settings: Settings): readonly string[] => Object.keys(settings).filter((key) => key !== 'privacyMode' && key !== 'clipboardClearAfterMs');
  const a = fields(left);
  const b = fields(right);
  if (a.length !== b.length) return false;
  return a.every((key) => Object.prototype.hasOwnProperty.call(right, key)
    && Object.is((left as unknown as Readonly<Record<string, unknown>>)[key], (right as unknown as Readonly<Record<string, unknown>>)[key]));
}
