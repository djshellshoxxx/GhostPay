import { PluginError } from './errors.js';
import type { PrivacyKind } from './manifest.js';
import { ShapeError, readBool, readInt, readShape } from './validate.js';

/** Maximum payout delay a setting may carry: 7 days, in seconds. */
export const MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;
/** Maximum batch size (anonymity set target). */
export const MAX_BATCH_SIZE = 1000;

/**
 * Concrete privacy settings. For every field, "more private" is well defined:
 * a longer delay, relay on, a larger batch.
 */
export interface PrivacySettings {
  readonly delaySeconds: number;
  readonly relay: boolean;
  readonly batchSize: number;
}

/** Restrictions a plugin may impose. They can only tighten (max / OR); never weaken. */
export interface PrivacyRestrictions {
  readonly minDelaySeconds?: number;
  readonly relayRequired?: true;
  readonly minBatchSize?: number;
}

/**
 * Validates host defaults.
 *
 * @throws {PluginError} `CONFIG`.
 */
export function validateSettings(value: unknown, path = 'defaults'): PrivacySettings {
  try {
    const r = readShape(value, ['delaySeconds', 'relay', 'batchSize'], [], path);
    return Object.freeze({
      delaySeconds: readInt(r.delaySeconds, 0, MAX_DELAY_SECONDS, `${path}.delaySeconds`),
      relay: readBool(r.relay, `${path}.relay`),
      batchSize: readInt(r.batchSize, 1, MAX_BATCH_SIZE, `${path}.batchSize`),
    });
  } catch (e) {
    if (e instanceof ShapeError) throw new PluginError('CONFIG', e.path);
    throw e;
  }
}

/** Field of {@link PrivacySettings} controlled by each kind. */
export const KIND_FIELD: Readonly<Record<PrivacyKind, keyof PrivacySettings>> = {
  delay: 'delaySeconds',
  relay: 'relay',
  batching: 'batchSize',
};

/**
 * Validates restrictions returned by a plugin, limited to kinds it declared.
 *
 * @param value Untrusted plugin output.
 * @param allowedKinds Kinds the plugin holds a capability for.
 * @param path Field path.
 * @returns Frozen copy.
 * @throws {ShapeError} On any violation (including an undeclared kind).
 */
export function readRestrictions(
  value: unknown,
  allowedKinds: ReadonlySet<PrivacyKind>,
  path: string,
): PrivacyRestrictions {
  const optional: string[] = [];
  if (allowedKinds.has('delay')) optional.push('minDelaySeconds');
  if (allowedKinds.has('relay')) optional.push('relayRequired');
  if (allowedKinds.has('batching')) optional.push('minBatchSize');
  const r = readShape(value, [], optional, path);
  const out: { minDelaySeconds?: number; relayRequired?: true; minBatchSize?: number } = {};
  if ('minDelaySeconds' in r)
    out.minDelaySeconds = readInt(r.minDelaySeconds, 0, MAX_DELAY_SECONDS, `${path}.minDelaySeconds`);
  if ('relayRequired' in r) {
    // Only `true` is expressible: a plugin cannot "require relay off".
    if (r.relayRequired !== true) throw new ShapeError(`${path}.relayRequired`);
    out.relayRequired = true;
  }
  if ('minBatchSize' in r)
    out.minBatchSize = readInt(r.minBatchSize, 1, MAX_BATCH_SIZE, `${path}.minBatchSize`);
  return Object.freeze(out);
}

/**
 * Applies restrictions monotonically: the result is never less private than `base`
 * in any field.
 */
export function tighten(base: PrivacySettings, r: PrivacyRestrictions): PrivacySettings {
  return Object.freeze({
    delaySeconds: Math.max(base.delaySeconds, r.minDelaySeconds ?? 0),
    relay: base.relay || r.relayRequired === true,
    batchSize: Math.max(base.batchSize, r.minBatchSize ?? 1),
  });
}

/** Whether `value` for `kind` is less private than `baseline`. */
export function isWeaker(kind: PrivacyKind, value: number | boolean, baseline: PrivacySettings): boolean {
  switch (kind) {
    case 'delay':
      return (value as number) < baseline.delaySeconds;
    case 'relay':
      return baseline.relay && value === false;
    case 'batching':
      return (value as number) < baseline.batchSize;
  }
}
