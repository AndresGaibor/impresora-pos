import { KnownDataPathsSchema } from '@impresora-pos/templates';
import type { TemplateDefinition, Block } from '@impresora-pos/templates';
import type { PrinterProfile } from '@impresora-pos/printer-core';

export interface LayoutCell {
  text: string;
  bold: boolean | undefined;
  size: 'normal' | 'double' | undefined;
  align: 'left' | 'center' | 'right' | undefined;
}

function makeCell(text: string, bold?: boolean, align?: 'left' | 'center' | 'right', size?: 'normal' | 'double'): LayoutCell {
  return { text, bold: bold ?? undefined, size: size ?? undefined, align: align ?? undefined };
}

export interface LayoutRow {
  cells: LayoutCell[];
  semanticRole: string | undefined;
  text: string;
}

export interface LayoutModel {
  columns: number;
  rows: LayoutRow[];
}

const APPROVED_PATHS = new Set<string>(KnownDataPathsSchema.options as unknown as string[]);

export function resolveLayout(
  template: TemplateDefinition,
  data: Record<string, unknown>,
  profile: PrinterProfile,
): LayoutModel {
  return resolveTemplateToLayout(template, data, profile);
}

function getIn(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isApprovedPath(path: string): boolean {
  return APPROVED_PATHS.has(path);
}

function normalizePath(path: string): string {
  return path.replace(/\[\]/g, '.');
}

function isApprovedItemPath(path: string): boolean {
  const normalized = normalizePath(path);
  return isApprovedPath(normalized) || isApprovedPath(path);
}

function resolveTemplateToLayout(
  template: TemplateDefinition,
  data: Record<string, unknown>,
  profile: PrinterProfile,
): LayoutModel {
  const rows: LayoutRow[] = [];
  const columns = profile.columns;

  for (const block of template.blocks) {
    const resolvedRows = resolveBlock(block, data, columns);
    rows.push(...resolvedRows);
  }

  return { columns, rows };
}

function resolveBlock(
  block: Block,
  data: Record<string, unknown>,
  columns: number,
): LayoutRow[] {
  switch (block.type) {
    case 'text':
      return [textToRow(block.content, columns, block.bold, block.size)];
    case 'field':
      return fieldToRow(block.path, data, columns);
    case 'divider':
      return [dividerToRow(block.char, columns)];
    case 'space':
      return spaceToRow(block.height);
    case 'items-table':
      return itemsTableToRows(block, data, columns);
    case 'totals':
      return totalsToRows(data, columns);
    case 'barcode':
      return barcodeToRow(block, data, columns);
    case 'qr':
      return qrToRow(block, data, columns);
    case 'cut':
      return [cutToRow()];
    case 'image':
      return [];
    default:
      return [];
  }
}

function textToRow(content: string, _columns: number, bold?: boolean, size?: 'normal' | 'double'): LayoutRow {
  return { cells: [makeCell(content, bold, undefined, size)], text: content, semanticRole: undefined };
}

function fieldToRow(path: string, data: Record<string, unknown>, columns: number): LayoutRow[] {
  if (!isApprovedPath(path)) return [];
  const value = getIn(data, path);
  if (value === undefined || value === null) return [];
  const text = String(value);
  return [wrapTextToRow(text, columns, pathToSemanticRole(path))];
}

function pathToSemanticRole(path: string): string | undefined {
  if (path === 'accessKey') return 'accessKey';
  if (path === 'totals' || path.startsWith('totals.')) return 'total';
  if (path.startsWith('items')) return 'item';
  if (path === 'issuerRuc') return 'issuerRuc';
  if (path === 'documentNumber') return 'documentNumber';
  if (path === 'customer' || path === 'customer.name' || path === 'customer.identifier') return 'customer';
  if (path === 'environment' || path.startsWith('environment.')) return 'environment';
  return undefined;
}

function dividerToRow(char: string | undefined, columns: number): LayoutRow {
  const dividerChar = char || '=';
  const text = dividerChar.repeat(columns);
  return { cells: [makeCell(text)], text, semanticRole: undefined };
}

function spaceToRow(height: number | undefined): LayoutRow[] {
  const lines = height || 1;
  return Array.from({ length: lines }, () => ({ cells: [makeCell('')], text: '', semanticRole: undefined }));
}

function itemsTableToRows(
  block: { columns: { header: string; path: string }[]; showWhenPresent?: string | undefined },
  data: Record<string, unknown>,
  columns: number,
): LayoutRow[] {
  const showWhen = block.showWhenPresent;
  if (showWhen && !isApprovedPath(showWhen)) {
    return [];
  }

  for (const col of block.columns) {
    if (!isApprovedItemPath(col.path)) {
      return [];
    }
  }

  const rows: LayoutRow[] = [];
  if (showWhen) {
    const items = getIn(data, showWhen);
    if (!items || !Array.isArray(items) || items.length === 0) return [];
  }

  rows.push({ cells: block.columns.map(c => makeCell(c.header, true)), text: block.columns.map(c => c.header).join(' '), semanticRole: 'item-header' });

  const items = getIn(data, 'items') as Array<Record<string, unknown>> | undefined;
  if (!items) return rows;

  for (const item of items) {
    const itemRows = buildItemRows(block.columns, item, columns);
    rows.push(...itemRows);
  }

  return rows;
}

function buildItemRows(
  tableColumns: { header: string; path: string }[],
  item: Record<string, unknown>,
  columns: number,
): LayoutRow[] {
  const cellTexts: string[] = [];
  for (const col of tableColumns) {
    const fieldPath = col.path.replace(/^items\[\]\./, '');
    const value = getIn(item, fieldPath);
    cellTexts.push(value !== undefined ? String(value) : '');
  }

  const SEP = ' ';
  const totalWidth = columns;
  const usableWidth = totalWidth - (tableColumns.length - 1) * SEP.length;

  const colWidths = tableColumns.map(col => {
    const fieldPath = col.path.replace(/^items\[\]\./, '');
    if (fieldPath === 'quantity' || fieldPath === 'total') return Math.ceil(usableWidth * 0.2);
    if (fieldPath === 'price') return Math.ceil(usableWidth * 0.2);
    return Math.floor(usableWidth * 0.4);
  });

  const rows: LayoutRow[] = [];
  let currentRowCells: LayoutCell[] = [];
  let currentRowText = '';
  let colIndex = 0;

  while (colIndex < tableColumns.length) {
    const colWidth = colWidths[colIndex] ?? 10;
    const text = cellTexts[colIndex] ?? '';
    const wrapped = wrapTextToWidth(text, colWidth);
    currentRowCells.push(...wrapped.map(t => makeCell(t)));
    if (colIndex > 0) {
      currentRowText += SEP;
    }
    currentRowText += text;
    colIndex++;
    if (colIndex < tableColumns.length) {
    } else {
      rows.push({ cells: currentRowCells, semanticRole: 'item', text: currentRowText });
      currentRowCells = [];
      currentRowText = '';
    }
  }

  if (currentRowCells.length > 0) {
    rows.push({ cells: currentRowCells, semanticRole: 'item', text: currentRowText });
  }

  return rows;
}

function wrapTextToWidth(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  if (text.length <= maxWidth) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > maxWidth) {
    lines.push(remaining.slice(0, maxWidth));
    remaining = remaining.slice(maxWidth);
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}

function totalsToRows(data: Record<string, unknown>, columns: number): LayoutRow[] {
  const rows: LayoutRow[] = [];
  const totals = getIn(data, 'totals') as Record<string, unknown> | undefined;
  if (!totals) return [];

  const orderedKeys = ['subtotal', 'tax', 'total'];
  for (const key of orderedKeys) {
    if (!Object.prototype.hasOwnProperty.call(totals, key)) continue;
    const value = totals[key];
    if (value === undefined || value === null) continue;
    const label = key.toUpperCase();
    const moneyStr = String(value);
    const text = `${label}: ${moneyStr}`;
    const semanticRole = key === 'total' ? 'total' : undefined;
    rows.push({ cells: [makeCell(text)], text, semanticRole });
  }

  return rows;
}

function barcodeToRow(
  block: { format?: string | undefined; value: string },
  data: Record<string, unknown>,
  _columns: number,
): LayoutRow[] {
  let value = block.value;
  if (value.startsWith('{') && value.endsWith('}')) {
    const path = value.slice(1, -1);
    if (!isApprovedPath(path)) return [];
    value = String(getIn(data, path) ?? value);
  }
  return [{ cells: [makeCell(value)], semanticRole: 'barcode', text: value }];
}

function qrToRow(
  block: { value: string; size?: number | undefined },
  data: Record<string, unknown>,
  _columns: number,
): LayoutRow[] {
  let value = block.value;
  if (value.startsWith('{') && value.endsWith('}')) {
    const path = value.slice(1, -1);
    if (!isApprovedPath(path)) return [];
    value = String(getIn(data, path) ?? value);
  }
  return [{ cells: [makeCell(value)], semanticRole: 'qr', text: value }];
}

function cutToRow(): LayoutRow {
  return { cells: [makeCell('')], semanticRole: 'cut', text: '' };
}

function wrapTextToRow(text: string, columns: number, semanticRole?: string): LayoutRow {
  const wrappedRows = wrapTextToRows([text], columns, semanticRole);
  return wrappedRows[0] || { cells: [makeCell('')], text: '', semanticRole: semanticRole ?? undefined };
}

function wrapTextToRows(texts: string[], columns: number, semanticRole?: string): LayoutRow[] {
  if (texts.length === 0) return [{ cells: [makeCell('')], text: '', semanticRole: semanticRole ?? undefined }];

  const rows: LayoutRow[] = [];
  let currentRow = '';
  let currentCells: LayoutCell[] = [];

  for (let t of texts) {
    if (currentRow.length + t.length + (currentRow.length > 0 ? 1 : 0) <= columns) {
      if (currentRow.length > 0) currentRow += ' ';
      currentRow += t;
      currentCells.push(makeCell(t));
    } else {
      if (currentRow.length > 0) {
        rows.push({ cells: currentCells, semanticRole: semanticRole ?? undefined, text: currentRow });
      }
      while (t.length > columns) {
        rows.push({ cells: [makeCell(t.slice(0, columns))], semanticRole: semanticRole ?? undefined, text: t.slice(0, columns) });
        t = t.slice(columns);
      }
      currentRow = t;
      currentCells = [makeCell(t)];
    }
  }

  if (currentRow.length > 0 || currentCells.length > 0) {
    rows.push({ cells: currentCells.length > 0 ? currentCells : [makeCell(currentRow)], semanticRole: semanticRole ?? undefined, text: currentRow });
  }

  return rows.length > 0 ? rows : [{ cells: [makeCell('')], semanticRole: semanticRole ?? undefined, text: '' }];
}
