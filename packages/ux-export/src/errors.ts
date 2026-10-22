/**
 * Error codes raised by the export/import pipeline. Messages never echo raw
 * field contents (they may be attacker-controlled); they carry positions only.
 */
export type ExportErrorCode =
  | 'INVALID_OPTION'
  | 'INVALID_ROW'
  | 'INVALID_TEXT'
  | 'INVALID_AMOUNT'
  | 'INVALID_DATE'
  | 'LIMIT_ROWS'
  | 'LIMIT_BYTES'
  | 'LIMIT_FIELDS'
  | 'LIMIT_FIELD_LENGTH'
  | 'PARSE_SYNTAX'
  | 'PARSE_RAGGED'
  | 'PARSE_HEADER'
  | 'PARSE_VALUE'
  | 'PARSE_DUPLICATE'
  | 'SUMMARY_MISMATCH';

/**
 * Typed error with an optional 1-based `row` (CSV record, header = 1) and
 * 1-based `column` where the problem was found.
 *
 * @security Messages are static strings plus numeric positions; never
 * untrusted content, so they are safe to log or display.
 */
export class ExportError extends Error {
  readonly code: ExportErrorCode;
  readonly row: number | undefined;
  readonly column: number | undefined;

  constructor(code: ExportErrorCode, message: string, row?: number, column?: number) {
    const where =
      row === undefined ? '' : column === undefined ? ` (row ${row})` : ` (row ${row}, column ${column})`;
    super(`${message}${where}`);
    this.name = 'ExportError';
    this.code = code;
    this.row = row;
    this.column = column;
  }
}
