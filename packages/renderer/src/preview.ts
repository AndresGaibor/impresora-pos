import type { LayoutModel } from './layout';

export interface PreviewCell {
  text: string;
  bold: boolean | undefined;
  size: 'normal' | 'double' | undefined;
  align: 'left' | 'center' | 'right' | undefined;
}

export interface PreviewRow {
  cells: PreviewCell[];
  semanticRole: string | undefined;
  text: string;
}

export interface PreviewDocument {
  columns: number;
  rows: PreviewRow[];
}

export function toPreviewModel(layout: LayoutModel): PreviewDocument {
  return {
    columns: layout.columns,
    rows: layout.rows.map(row => ({
      cells: row.cells.map(cell => ({
        text: cell.text,
        bold: cell.bold,
        size: cell.size,
        align: cell.align,
      })),
      semanticRole: row.semanticRole,
      text: row.text,
    })),
  };
}
