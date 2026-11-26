import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Workbook } from '@oai/artifact-tool';

const outputDir = '/workspace/scratch/f80482f352bc/branch-index-current-main-20261124';
const input = JSON.parse(await fs.readFile(`${outputDir}/INDEX_DATA.json`, 'utf8'));
const matrix = [input.columns, ...input.rows.map(row => input.columns.map(column => row[column] == null ? '' : row[column]))];
assert.equal(input.rows.length, 699);
assert.equal(input.columns.length, 25);
const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Branch index');
const range = sheet.getRangeByIndexes(0, 0, matrix.length, input.columns.length);
range.values = matrix;
sheet.showGridLines = false;
range.format.font = { name: 'Arial', size: 10 };
range.format.rowHeight = 22;
sheet.getRange('A1:Y1').format = { fill: '#17365D', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' } };
sheet.getRange('A1:A700').format.columnWidth = 72;
sheet.getRange('B1:B700').format.columnWidth = 47;
sheet.getRange('C1:C700').format.columnWidth = 28;
sheet.freezePanes.freezeRows(1);
workbook.recalculate();

const returned = range.values.map(row => row.map(value => value == null ? '' : value));
assert.deepEqual(returned, matrix);
const inspection = await workbook.inspect({ kind: 'table', range: "'Branch index'!V1:Y5", include: 'values,formulas',
    maxChars: 2500, tableMaxRows: 5, tableMaxCols: 4, tableMaxCellChars: 90 });
await fs.writeFile('/workspace/scratch/f80482f352bc/branch-index-current-main-20261124/inspection.ndjson', inspection.ndjson);
const errors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
    options: { useRegex: true, maxResults: 20 }, summary: 'CSV values inspection' });
await fs.writeFile('/workspace/scratch/f80482f352bc/branch-index-current-main-20261124/error-scan.ndjson', errors.ndjson);

// The documented artifact API provides CSV import and raw range values, but no
// CSV exporter. Serialize the authored and verified values using RFC 4180 quoting.
const field = value => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = returned.map(row => row.map(field).join(',')).join('\r\n') + '\r\n';
await fs.writeFile(`${outputDir}/BRANCH_INDEX_699.csv`, csv);
const preview = await workbook.render({ sheetName: 'Branch index', range: 'A1:C7', scale: 1, format: 'png' });
await fs.writeFile('/workspace/scratch/f80482f352bc/branch-index-current-main-20261124/preview.png', new Uint8Array(await preview.arrayBuffer()));
console.log(JSON.stringify({ rows: input.rows.length, columns: input.columns.length, all_cells_exact: true,
    output: `${outputDir}/BRANCH_INDEX_699.csv`, bytes: Buffer.byteLength(csv) }));
