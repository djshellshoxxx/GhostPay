import { checkCatalogs, sampleCatalogs, I18nError, type Catalog, type LocaleReport } from '@ghostpay/i18n';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { noPositionals } from '../args.js';
import type { Ctx } from '../ctx.js';
import { failError, usageError } from '../io.js';
import type { Command } from './types.js';

async function loadCatalog(ctx: Ctx, path: string): Promise<Catalog> {
  const v = parseStrictJson(await ctx.read(path));
  if (typeof v !== 'object' || v === null || Array.isArray(v) || !Object.values(v).every((x) => typeof x === 'string'))
    throw failError('BAD_CATALOG', 'a catalog file must be a JSON object of string messages.');
  return v as Catalog;
}

function line(r: LocaleReport): string {
  const bits = [
    `${r.translated}/${r.total}`,
    ...(r.missing.length > 0 ? [`missing ${r.missing.join(',')}`] : []),
    ...(r.extra.length > 0 ? [`extra ${r.extra.join(',')}`] : []),
    ...(r.placeholderMismatches.length > 0 ? [`placeholders ${r.placeholderMismatches.map((m) => m.key).join(',')}`] : []),
    ...(r.syntaxErrors.length > 0 ? [`syntax ${r.syntaxErrors.map((m) => m.key).join(',')}`] : []),
    ...(r.htmlLike.length > 0 ? [`html-like ${r.htmlLike.join(',')}`] : []),
    ...(r.missingPluralCategories.length > 0 ? [`plural ${r.missingPluralCategories.map((m) => m.key).join(',')}`] : []),
  ];
  return `${r.ok ? 'ok  ' : 'FAIL'} ${r.locale.padEnd(8)} ${bits.join('; ')}`;
}

export const i18nCommands: readonly Command[] = [
  {
    path: ['i18n', 'check'],
    summary: 'check message catalogs for missing keys, placeholders and plural forms',
    usage: 'ghostpay i18n check [--base en] [--catalog LOCALE=FILE.json]...\n  Without --catalog the bundled sample catalogs are checked. Exit 1 on any problem.',
    opts: { base: 'value', catalog: 'multi' },
    handler: async (ctx, a) => {
      noPositionals(a);
      let catalogs: Record<string, Catalog> = { ...sampleCatalogs };
      const given = a.multi.get('catalog') ?? [];
      if (given.length > 0) {
        catalogs = {};
        for (const spec of given) {
          const m = /^([A-Za-z0-9-]{2,35})=(.+)$/.exec(spec);
          if (m === null) throw usageError('BAD_CATALOG_ARG', '--catalog must look like es=./es.json.');
          catalogs[m[1] as string] = await loadCatalog(ctx, m[2] as string);
        }
      }
      try {
        const report = checkCatalogs(catalogs, a.values.get('base') ?? 'en');
        ctx.out({ ok: report.ok, base: report.base, locales: report.locales }, report.locales.map(line).join('\n'));
        return report.ok ? 0 : 1;
      } catch (e) {
        if (e instanceof I18nError) throw failError(e.code, `catalog check failed (${e.code}).`, 'Check --base and the --catalog locale tags.');
        throw e;
      }
    },
  },
];
