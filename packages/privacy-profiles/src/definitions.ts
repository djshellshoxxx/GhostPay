/**
 * Self-validation of the definition data: catalogue, rules and presets.
 *
 * The package is driven by data, so a typo in a rule or preset is a silent behaviour change: a predicate that names a
 * value no option has simply never fires. `validateDefinitions` checks that every declared dependency, predicate, key and
 * preference refers to something that exists, that rule shapes are consistent, that presets obey their policy, and that no
 * option depends on itself through a cycle of `requires` rules or `activeWhen` conditions. It takes the definitions as an
 * argument so tests (and any later data source) can feed it malformed data; with no argument it checks the shipped data,
 * which a test requires to be clean.
 *
 * A dependency cycle (A needs B, B needs A, directly or through others) is reported rather than tolerated: the shipped
 * specs declare none, and a cycle means neither option can be enabled first by a one-at-a-time editor.
 * @security Total on any input: malformed data is reported as `D_MALFORMED`, never thrown. Nesting is depth-bounded.
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { deepFreeze } from './freeze.js';
import { isRecord } from './input.js';
import { ACK_KEYS, ALL_CAPABILITIES, WARNING_KEYS } from './keys.js';
import { PRESETS } from './presets.js';
import { RULES } from './rules.js';
import { ACTIONS, ASSET_KINDS, ENVS, OPTION_IDS } from './types.js';
import type { IssueCode, OptionDef, PresetDef, RuleDef, ScanName } from './types.js';

/** Definition problems. */
export type DefinitionIssueCode =
  | 'D_MALFORMED'
  | 'D_ID_MISMATCH'
  | 'D_MISSING_OPTION'
  | 'D_UNKNOWN_OPTION'
  | 'D_UNKNOWN_VALUE'
  | 'D_UNKNOWN_CAPABILITY'
  | 'D_UNKNOWN_ACK'
  | 'D_UNKNOWN_KEY'
  | 'D_BAD_DEFAULT'
  | 'D_DUPLICATE_VALUE'
  | 'D_DUPLICATE_RULE_ID'
  | 'D_BAD_PRED'
  | 'D_BAD_RULE_SHAPE'
  | 'D_PRESET_ORDER'
  | 'D_PRESET_DEFAULT'
  | 'D_PRESET_POLICY'
  | 'D_DEPENDENCY_CYCLE';

/** One problem and where it is (slash separated path into the definitions). */
export interface DefinitionIssue {
  readonly code: DefinitionIssueCode;
  readonly where: string;
}

/** The three data tables. */
export interface Definitions {
  readonly catalogue: Readonly<Record<string, OptionDef>>;
  readonly rules: readonly RuleDef[];
  readonly presets: Readonly<Record<string, PresetDef>>;
}

const SCAN_NAMES = ['chain', 'maturity-unavailable', 'maturity-test-only', 'maturity-experimental', 'env', 'selftest', 'relay-direct'] as const satisfies readonly ScanName[];
const ISSUE_CODES = [
  'E_CONFLICT', 'E_REQUIRES', 'E_CAPABILITY', 'E_WRONG_CHAIN', 'E_WRONG_ENV', 'E_WRONG_ASSET', 'E_NOT_SELECTABLE', 'E_UNKNOWN_VALUE',
  'E_MATURITY', 'E_ACK_MISSING', 'E_SELFTEST', 'E_INVALID_SELECTION', 'E_INVALID_CONTEXT', 'W_RULE', 'W_VALUE', 'W_MOOT',
] as const satisfies readonly IssueCode[];
type AssertNever<T extends never> = T;
/** Compile-time checks that the lists above name every scan and issue code. */
export type ScanNamesComplete = AssertNever<Exclude<ScanName, (typeof SCAN_NAMES)[number]>>;
export type IssueCodesComplete = AssertNever<Exclude<IssueCode, (typeof ISSUE_CODES)[number]>>;

const RULE_KINDS: readonly string[] = ['conflict', 'requires', 'warn', 'moot'];
const FORBIDDEN_MATURITY: readonly string[] = ['experimental', 'test-only', 'stub', 'watch'];
const MAX_DEPTH = 32;
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const strings = (x: unknown): string[] | null => (Array.isArray(x) && x.every((e) => typeof e === 'string') ? x : null);

const SHIPPED: Definitions = { catalogue: OPTION_CATALOGUE, rules: RULES, presets: PRESETS };

/** Values each known option offers in the given catalogue (shipped catalogue where the given one is unusable). */
function valueTable(catalogue: Record<string, unknown>): Map<string, Map<string, { maturity: string; isDefault: boolean }>> {
  const out = new Map<string, Map<string, { maturity: string; isDefault: boolean }>>();
  for (const id of OPTION_IDS) {
    const d = has(catalogue, id) ? catalogue[id] : undefined;
    const values = isRecord(d) && Array.isArray(d['values']) ? (d['values'] as unknown[]) : null;
    const m = new Map<string, { maturity: string; isDefault: boolean }>();
    if (values) {
      for (const v of values) {
        if (isRecord(v) && typeof v['value'] === 'string') m.set(v['value'], { maturity: typeof v['maturity'] === 'string' ? v['maturity'] : '', isDefault: isRecord(d) && d['defaultValue'] === v['value'] });
      }
    }
    out.set(id, m);
  }
  return out;
}

type Table = ReturnType<typeof valueTable>;

function checkPred(p: unknown, where: string, table: Table, add: (c: DefinitionIssueCode, w: string) => void, depth = 0): void {
  if (depth > MAX_DEPTH || !isRecord(p)) return add('D_BAD_PRED', where);
  const keys = Object.keys(p).filter((k) => ['opt', 'cap', 'notCap', 'env', 'asset', 'assetNot', 'action', 'ack', 'scan', 'all', 'any', 'not'].includes(k));
  const extra = Object.keys(p).filter((k) => k !== 'in' && k !== 'notIn' && !keys.includes(k));
  if (keys.length !== 1 || extra.length > 0) return add('D_BAD_PRED', where);
  const kind = keys[0] as string;
  if (kind === 'opt') {
    const opt = p['opt'];
    const list = has(p, 'in') ? p['in'] : has(p, 'notIn') ? p['notIn'] : undefined;
    const names = strings(list);
    if (typeof opt !== 'string' || names === null || (has(p, 'in') && has(p, 'notIn'))) return add('D_BAD_PRED', where);
    const values = table.get(opt);
    if (!values) return add('D_UNKNOWN_OPTION', where);
    for (const n of names) if (values.size > 0 && !values.has(n)) add('D_UNKNOWN_VALUE', where);
  } else if (kind === 'cap' || kind === 'notCap') {
    if (typeof p[kind] !== 'string' || !(ALL_CAPABILITIES as readonly string[]).includes(p[kind])) add('D_UNKNOWN_CAPABILITY', where);
  } else if (kind === 'ack') {
    if (typeof p['ack'] !== 'string' || !(ACK_KEYS as readonly string[]).includes(p['ack'])) add('D_UNKNOWN_ACK', where);
  } else if (kind === 'scan') {
    if (typeof p['scan'] !== 'string' || !(SCAN_NAMES as readonly string[]).includes(p['scan'])) add('D_BAD_PRED', where);
  } else if (kind === 'env' || kind === 'action' || kind === 'asset' || kind === 'assetNot') {
    const allowed: readonly string[] = kind === 'env' ? ENVS : kind === 'action' ? ACTIONS : ASSET_KINDS;
    const names = strings(p[kind]);
    if (names === null || names.length === 0 || names.some((n) => !allowed.includes(n))) add('D_BAD_PRED', where);
  } else if (kind === 'all' || kind === 'any') {
    const list = p[kind];
    if (!Array.isArray(list) || list.length === 0) return add('D_BAD_PRED', where);
    list.forEach((q: unknown, i) => checkPred(q, `${where}/${kind}/${i}`, table, add, depth + 1));
  } else {
    checkPred(p['not'], `${where}/not`, table, add, depth + 1);
  }
}

function checkCatalogue(catalogue: Record<string, unknown>, table: Table, add: (c: DefinitionIssueCode, w: string) => void): void {
  for (const id of OPTION_IDS) if (!has(catalogue, id)) add('D_MISSING_OPTION', `catalogue/${id}`);
  for (const key of Object.keys(catalogue)) {
    const where = `catalogue/${key}`;
    if (!(OPTION_IDS as readonly string[]).includes(key)) {
      add('D_UNKNOWN_OPTION', where);
      continue;
    }
    const d = catalogue[key];
    if (!isRecord(d) || !Array.isArray(d['values'])) {
      add('D_MALFORMED', where);
      continue;
    }
    if (d['id'] !== key) add('D_ID_MISMATCH', where);
    const seen = new Set<string>();
    (d['values'] as unknown[]).forEach((v, i) => {
      const vw = `${where}/values/${i}`;
      if (!isRecord(v) || typeof v['value'] !== 'string') return add('D_MALFORMED', vw);
      if (seen.has(v['value'])) add('D_DUPLICATE_VALUE', vw);
      seen.add(v['value']);
      for (const field of ['requires', 'requiresAny'] as const) {
        if (!has(v, field)) continue;
        const caps = strings(v[field]);
        if (caps === null) add('D_MALFORMED', `${vw}/${field}`);
        else if (caps.some((c) => !(ALL_CAPABILITIES as readonly string[]).includes(c))) add('D_UNKNOWN_CAPABILITY', `${vw}/${field}`);
      }
      const acks = strings(v['acks']);
      if (acks === null) add('D_MALFORMED', `${vw}/acks`);
      else if (acks.some((a) => !(ACK_KEYS as readonly string[]).includes(a))) add('D_UNKNOWN_ACK', `${vw}/acks`);
      const warnings = strings(v['warnings']);
      if (warnings === null) add('D_MALFORMED', `${vw}/warnings`);
      else if (warnings.some((w) => !(WARNING_KEYS as readonly string[]).includes(w))) add('D_UNKNOWN_KEY', `${vw}/warnings`);
    });
    if (typeof d['defaultValue'] !== 'string' || !seen.has(d['defaultValue'])) add('D_BAD_DEFAULT', where);
    if (has(d, 'activeWhen')) checkPred(d['activeWhen'], `${where}/activeWhen`, table, add);
  }
}

function checkRules(rules: readonly unknown[], table: Table, add: (c: DefinitionIssueCode, w: string) => void): void {
  const ids = new Set<string>();
  rules.forEach((r, i) => {
    if (!isRecord(r)) return add('D_MALFORMED', `rules/${i}`);
    const id = typeof r['id'] === 'string' ? r['id'] : String(i);
    const where = `rules/${id}`;
    if (ids.has(id)) add('D_DUPLICATE_RULE_ID', where);
    ids.add(id);
    const kind = r['kind'];
    const key = r['key'];
    if (typeof kind !== 'string' || !RULE_KINDS.includes(kind) || typeof key !== 'string') return add('D_BAD_RULE_SHAPE', where);
    const wantsErr = kind === 'conflict' || kind === 'requires';
    if (!key.startsWith(wantsErr ? 'privacy.err.' : 'privacy.warn.')) add('D_BAD_RULE_SHAPE', where);
    if (has(r, 'code') && (typeof r['code'] !== 'string' || !(ISSUE_CODES as readonly string[]).includes(r['code']))) add('D_BAD_RULE_SHAPE', where);
    const hasThen = has(r, 'then') && r['then'] !== undefined;
    if (kind === 'requires' !== hasThen) add('D_BAD_RULE_SHAPE', where);
    checkPred(r['when'], `${where}/when`, table, add);
    if (hasThen) checkPred(r['then'], `${where}/then`, table, add);
  });
}

function checkPresets(presets: Record<string, unknown>, table: Table, add: (c: DefinitionIssueCode, w: string) => void): void {
  for (const key of Object.keys(presets)) {
    const p = presets[key];
    const where = `presets/${key}`;
    if (!isRecord(p) || !Array.isArray(p['order']) || !isRecord(p['prefer'])) {
      add('D_MALFORMED', where);
      continue;
    }
    if (p['id'] !== key) add('D_ID_MISMATCH', where);
    const seen = new Set<unknown>();
    for (const o of p['order'] as unknown[]) {
      if (typeof o !== 'string' || !table.has(o)) add('D_UNKNOWN_OPTION', `${where}/order`);
      else if (seen.has(o)) add('D_PRESET_ORDER', `${where}/order/${o}`);
      seen.add(o);
    }
    for (const opt of Object.keys(p['prefer'])) {
      const list = strings(p['prefer'][opt]);
      const values = table.get(opt);
      const w = `${where}/prefer/${opt}`;
      if (!values) {
        add('D_UNKNOWN_OPTION', w);
        continue;
      }
      if (list === null || list.length === 0) {
        add('D_MALFORMED', w);
        continue;
      }
      for (const v of list) {
        const info = values.get(v);
        if (!info) {
          add('D_UNKNOWN_VALUE', w);
          continue;
        }
        const forbidden = FORBIDDEN_MATURITY.includes(info.maturity) || (opt === 'sweep.hops' && v !== '0') || (opt === 'btc.mode' && v !== 'silent-payment');
        if (!info.isDefault && forbidden) add('D_PRESET_POLICY', w);
      }
      if (!values.get(list[list.length - 1] as string)?.isDefault) add('D_PRESET_DEFAULT', w);
    }
  }
}

/** Option ids named by a predicate, tolerant of malformed predicates and bounded in depth. */
function optionsIn(p: unknown, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > MAX_DEPTH || !isRecord(p)) return out;
  if (typeof p['opt'] === 'string' && (OPTION_IDS as readonly string[]).includes(p['opt'])) out.add(p['opt']);
  for (const k of ['all', 'any'] as const) if (Array.isArray(p[k])) for (const q of p[k] as unknown[]) optionsIn(q, out, depth + 1);
  if (has(p, 'not')) optionsIn(p['not'], out, depth + 1);
  return out;
}

/**
 * Cycles in the option dependency graph, each as its sorted option ids, sorted. Edges: a `requires` rule makes every option
 * in its `when` depend on every option in its `then` that is not itself in `when`; an `activeWhen` condition makes the
 * option depend on the options it names. Pass `{}` as `catalogue` to look at the rules alone.
 */
export function findDependencyCycles(rules: readonly RuleDef[], catalogue: Readonly<Record<string, OptionDef>> = OPTION_CATALOGUE): readonly (readonly string[])[] {
  const edges = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    edges.set(from, (edges.get(from) ?? new Set<string>()).add(to));
    if (!edges.has(to)) edges.set(to, new Set<string>());
  };
  if (Array.isArray(rules)) {
    for (const r of rules as unknown[]) {
      if (!isRecord(r) || r['kind'] !== 'requires' || r['then'] === undefined) continue;
      const from = optionsIn(r['when']);
      for (const t of optionsIn(r['then'])) if (!from.has(t)) for (const f of from) link(f, t);
    }
  }
  if (isRecord(catalogue)) {
    for (const id of OPTION_IDS) {
      const d = has(catalogue, id) ? catalogue[id] : undefined;
      if (!isRecord(d) || !has(d, 'activeWhen')) continue;
      for (const dep of optionsIn(d['activeWhen'])) if (dep !== id) link(id, dep);
    }
  }
  // Tarjan's strongly connected components; a component of two or more options is a cycle.
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  let n = 0;
  const visit = (v: string): void => {
    index.set(v, n);
    low.set(v, n);
    n += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of [...(edges.get(v) ?? [])].sort()) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v) as number, index.get(w) as number));
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w !== undefined) {
          onStack.delete(w);
          comp.push(w);
        }
      } while (w !== undefined && w !== v);
      if (comp.length > 1) out.push(comp.sort());
    }
  };
  for (const v of [...edges.keys()].sort()) if (!index.has(v)) visit(v);
  return deepFreeze(out.sort((a, b) => ((a[0] as string) < (b[0] as string) ? -1 : (a[0] as string) > (b[0] as string) ? 1 : 0)));
}

/**
 * Checks definition data for internal consistency and returns every problem, sorted by location. Empty means consistent.
 * Defaults to the shipped data, which a test requires to be consistent.
 */
export function validateDefinitions(defs: Definitions = SHIPPED): readonly DefinitionIssue[] {
  if (!isRecord(defs) || !isRecord(defs.catalogue) || !Array.isArray(defs.rules) || !isRecord(defs.presets)) {
    return deepFreeze([{ code: 'D_MALFORMED' as const, where: '' }]);
  }
  const issues: DefinitionIssue[] = [];
  const add = (code: DefinitionIssueCode, where: string): void => {
    issues.push({ code, where });
  };
  const table = valueTable(defs.catalogue);
  checkCatalogue(defs.catalogue, table, add);
  checkRules(defs.rules, table, add);
  checkPresets(defs.presets, table, add);
  for (const cyc of findDependencyCycles(defs.rules, defs.catalogue)) add('D_DEPENDENCY_CYCLE', `rules/${cyc.join('+')}`);
  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const k = `${i.where}|${i.code}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return deepFreeze(unique.sort((a, b) => (a.where < b.where ? -1 : a.where > b.where ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0)));
}
