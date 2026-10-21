import { err, ok, readClock, type Clock, type Result } from './result.js';
import {
  checkKeys,
  isPlainObject,
  validAmount,
  validId,
  validRecipient,
  validText,
  validToken,
} from './validate.js';

/** Maximum templates a user may hold (bounds imports and UI lists). */
export const MAX_TEMPLATES = 200;

/** A reusable payment definition. Contains no keys or secrets. */
export interface PaymentTemplate {
  readonly id: string;
  readonly name: string;
  readonly chain: string;
  readonly asset: string;
  readonly recipient: string;
  /** Positive integer, base units, decimal string. */
  readonly amount: string;
  readonly memo?: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface TemplateInput {
  readonly id: string;
  readonly name: string;
  readonly chain: string;
  readonly asset: string;
  readonly recipient: string;
  readonly amount: string;
  readonly memo?: string;
}

const INPUT_KEYS = ['id', 'name', 'chain', 'asset', 'recipient', 'amount', 'memo'];
const STORED_KEYS = [...INPUT_KEYS, 'createdAtMs', 'updatedAtMs'];

function validateFields(o: Record<string, unknown>): Result<TemplateInput> {
  const id = validId(o['id'], 'id');
  if (!id.ok) return id;
  const name = validText(o['name'], 'name', 1, 64);
  if (!name.ok) return name;
  const chain = validToken(o['chain'], 'chain');
  if (!chain.ok) return chain;
  const asset = validToken(o['asset'], 'asset');
  if (!asset.ok) return asset;
  const recipient = validRecipient(o['recipient']);
  if (!recipient.ok) return recipient;
  const amount = validAmount(o['amount']);
  if (!amount.ok) return amount;
  const base = {
    id: id.value,
    name: name.value,
    chain: chain.value,
    asset: asset.value,
    recipient: recipient.value,
    amount: amount.value,
  };
  if (o['memo'] === undefined) return ok(base);
  const memo = validText(o['memo'], 'memo', 0, 140);
  if (!memo.ok) return memo;
  return ok({ ...base, memo: memo.value });
}

/**
 * Create a template from untrusted input.
 * @security Strict allow-list of keys and formats; never executes or fetches anything.
 */
export function createTemplate(input: unknown, clock: Clock): Result<PaymentTemplate> {
  if (!isPlainObject(input)) return err('bad_template', 'template must be an object');
  const k = checkKeys(input, INPUT_KEYS, 'template');
  if (!k.ok) return k;
  const v = validateFields(input);
  if (!v.ok) return v;
  const now = readClock(clock);
  return ok({ ...v.value, createdAtMs: now, updatedAtMs: now });
}

/** Apply a partial patch (id is immutable); the merged result is fully re-validated. */
export function updateTemplate(
  t: PaymentTemplate,
  patch: unknown,
  clock: Clock,
): Result<PaymentTemplate> {
  if (!isPlainObject(patch)) return err('bad_template', 'patch must be an object');
  const k = checkKeys(patch, INPUT_KEYS.filter((x) => x !== 'id'), 'patch');
  if (!k.ok) return k;
  const merged: Record<string, unknown> = {
    id: t.id,
    name: t.name,
    chain: t.chain,
    asset: t.asset,
    recipient: t.recipient,
    amount: t.amount,
    ...(t.memo === undefined ? {} : { memo: t.memo }),
    ...patch,
  };
  const v = validateFields(merged);
  if (!v.ok) return v;
  return ok({ ...v.value, createdAtMs: t.createdAtMs, updatedAtMs: readClock(clock) });
}

/** Add to a list; enforces uniqueness of id and (case-insensitive) name, and the size cap. */
export function addTemplate(
  list: readonly PaymentTemplate[],
  t: PaymentTemplate,
): Result<readonly PaymentTemplate[]> {
  if (list.length >= MAX_TEMPLATES) return err('too_many', 'template limit reached');
  if (list.some((x) => x.id === t.id)) return err('duplicate_id', 'template id already exists');
  const n = t.name.toLowerCase();
  if (list.some((x) => x.name.toLowerCase() === n)) {
    return err('duplicate_name', 'template name already exists');
  }
  return ok([...list, t]);
}

export function removeTemplate(
  list: readonly PaymentTemplate[],
  id: string,
): Result<readonly PaymentTemplate[]> {
  if (!list.some((x) => x.id === id)) return err('not_found', 'template not found');
  return ok(list.filter((x) => x.id !== id));
}

/**
 * Parse an untrusted stored/imported template list (all-or-nothing).
 * @security Imported data is never trusted; one bad entry rejects the whole import.
 */
export function parseTemplates(raw: unknown): Result<readonly PaymentTemplate[]> {
  if (!Array.isArray(raw)) return err('bad_import', 'expected an array');
  if (raw.length > MAX_TEMPLATES) return err('too_many', 'template limit exceeded');
  let out: readonly PaymentTemplate[] = [];
  for (const item of raw as unknown[]) {
    if (!isPlainObject(item)) return err('bad_template', 'template must be an object');
    const k = checkKeys(item, STORED_KEYS, 'template');
    if (!k.ok) return k;
    const v = validateFields(item);
    if (!v.ok) return v;
    const c = item['createdAtMs'];
    const u = item['updatedAtMs'];
    if (
      typeof c !== 'number' || typeof u !== 'number' ||
      !Number.isSafeInteger(c) || !Number.isSafeInteger(u) || c < 0 || u < c
    ) {
      return err('bad_time', 'invalid template timestamps');
    }
    const added = addTemplate(out, { ...v.value, createdAtMs: c, updatedAtMs: u });
    if (!added.ok) return added;
    out = added.value;
  }
  return ok(out);
}
