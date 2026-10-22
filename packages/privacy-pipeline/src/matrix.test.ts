import { describe, expect, it } from 'vitest';
import { MATRIX_COLS, MATRIX_ROWS, chainMatrix } from './matrix.js';

type Sym = 'Y' | 'W' | 'M' | 'X' | '-';
const REL: Record<string, Sym> = { valid: 'Y', harmful: 'W', redundant: 'M', impossible: 'X', 'n/a': '-' };

/** Chaining spec section 4 compact table; each cell lists the symbols it shows (a cell may show several). */
const SPEC_TABLE: Record<string, Sym[][]> = {
  'amount.shape': [['-'], ['-'], ['Y'], ['-'], ['-'], ['Y', 'W'], ['X']],
  'payer.fresh-wallet': [['-'], ['-'], ['Y'], ['-'], ['-'], ['Y'], ['-']],
  'ct.wrap': [['-'], ['-'], ['X'], ['-'], ['-'], ['W'], ['X']],
  'sweep.delay': [['Y'], ['Y'], ['M'], ['-'], ['-'], ['-'], ['-']],
  'hops.forward': [['Y'], ['Y'], ['M', 'X'], ['-'], ['-'], ['-'], ['-']],
  'hygiene.sweep': [['X'], ['X'], ['X'], ['-'], ['-'], ['-'], ['-']],
  'pool.deposit': [['-'], ['-'], ['X'], ['Y'], ['-'], ['-'], ['Y']],
  'pool.exit': [['X'], ['X'], ['X'], ['-'], ['-'], ['-'], ['-']],
};
/** Cells where the generated relation under default parameters is allowed to differ from the spec table, with the reason. */
const KNOWN_DIFFS: Record<string, { got: Sym; why: string }> = {
  'ct.wrap>pool.deposit': {
    got: '-',
    why: 'blocked by typing (confidential funds are not accepted); spec cites C-13, which is about a received confidential stealth',
  },
  'ct.wrap>pay.from-pool': { got: '-', why: 'blocked by typing; spec shows X without a rule id' },
  'ct.wrap>pay.submit': {
    got: 'Y',
    why: 'default wrap dwell equals the minimum, so the C-15 warning needs a shorter dwell or an exact amount',
  },
  'sweep.delay>ct.sweep': {
    got: 'Y',
    why: 'a confidential receipt may be delayed before ct.sweep; the spec table shows no relation',
  },
};
/** Rows that end a lineage: every column is blocked by T-3 (the spec shows `-` for columns that were type errors anyway). */
const TERMINAL_ROWS = ['hygiene.sweep', 'pool.exit'];

describe('chainMatrix (chaining spec section 4, compact table)', () => {
  const cells = chainMatrix();
  it('has one cell per row and column', () => {
    expect(cells).toHaveLength(MATRIX_ROWS.length * MATRIX_COLS.length);
  });
  it('agrees with the spec table, except for the documented cells', () => {
    const diffs: string[] = [];
    for (const [ri, row] of MATRIX_ROWS.entries()) {
      for (const [ci, col] of MATRIX_COLS.entries()) {
        const cell = cells[ri * MATRIX_COLS.length + ci];
        const got = REL[cell?.relation ?? 'n/a'] as Sym;
        const allowed = (SPEC_TABLE[row] as Sym[][])[ci] as Sym[];
        const key = `${row}>${col}`;
        if (!allowed.includes(got)) {
          if (KNOWN_DIFFS[key]?.got === got) continue;
          if (TERMINAL_ROWS.includes(row) && got === 'X') continue;
          diffs.push(`${key}: got ${got} (${cell?.rules.join(',') ?? ''}), spec ${allowed.join('/')}`);
        }
      }
    }
    expect(diffs).toEqual([]);
  });
  it('terminal rows are X by type T-3 or by C-03', () => {
    const hy = cells.filter((c) => c.before === 'hygiene.sweep').slice(0, 3);
    for (const c of hy) expect(c.rules).toContain('T-3');
    const ex = cells.filter((c) => c.before === 'pool.exit').slice(0, 3);
    for (const c of ex) expect(c.rules).toEqual(expect.arrayContaining(['C-03']));
  });
  it('snapshot of the generated table', () => {
    const rows = MATRIX_ROWS.map(
      (r) =>
        `${r.padEnd(20)}${MATRIX_COLS.map((_c, i) => REL[cells[MATRIX_ROWS.indexOf(r) * MATRIX_COLS.length + i]?.relation ?? 'n/a']).join(' ')}`,
    );
    expect(rows.join('\n')).toMatchSnapshot();
  });
  it('is deterministic', () => {
    expect(chainMatrix()).toEqual(cells);
  });
});
