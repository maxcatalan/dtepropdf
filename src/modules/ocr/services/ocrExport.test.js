import { describe, expect, it } from 'vitest';
import {
  buildExportMatrix,
  buildFinalTable,
  buildHeaderMetaFields,
  sanitizeTableRows,
} from './ocrExport';

describe('ocrExport', () => {
  it('elimina filas completamente vacías antes de exportar', () => {
    const rows = sanitizeTableRows(
      ['Codigo', 'Descripcion'],
      [
        ['120', 'Producto'],
        ['', ''],
        [' ', '   '],
        ['220', 'Otro'],
      ],
    );

    expect(rows).toEqual([
      ['120', 'Producto'],
      ['220', 'Otro'],
    ]);
  });

  it('incluye los campos extraídos fuera de la tabla en el bloque de exportación', () => {
    const metaFields = [
      { key: 'folio', label: 'Folio' },
      { key: 'proveedor', label: 'Proveedor' },
    ];
    const activeMetaKeys = new Set(['folio', 'proveedor']);
    const headerMetaFields = buildHeaderMetaFields(
      { folio: '123', proveedor: 'ACME', total: '$1000' },
      activeMetaKeys,
      [],
      metaFields,
    );
    const { finalHeaders, finalRows } = buildFinalTable(
      ['Codigo', 'Monto'],
      [['A1', '$1000']],
      { folio: '123', proveedor: 'ACME', total: '$1000' },
      activeMetaKeys,
      [],
      metaFields,
    );

    const matrix = buildExportMatrix(headerMetaFields, finalHeaders, finalRows, true);

    expect(matrix).toEqual([
      ['Campo', 'Valor'],
      ['Folio', '123'],
      ['Proveedor', 'ACME'],
      ['total', '$1000'],
      [],
      ['Codigo', 'Monto'],
      ['A1', '$1000'],
    ]);
  });
});
