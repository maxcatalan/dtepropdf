import { useState } from 'react';
import { downloadText } from '../services/extractTable';
import {
  buildExportMatrix,
  buildFinalTable,
  buildHeaderMetaFields,
  matrixToCSV,
} from '../services/ocrExport';
import { ALL_META_FIELDS } from '../ocrConstants';

function downloadXLSX(exportMatrix, filename) {
  import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportMatrix);
    XLSX.utils.book_append_sheet(wb, ws, 'Extraccion');
    XLSX.writeFile(wb, filename);
  });
}

export default function OcrTableView({
  headers, rows, meta = {},
  showTable = true,
  activeMetaKeys = new Set(),
  columnMetaOrder = [],
  filename, onReset,
  metaFields = ALL_META_FIELDS,
}) {
  const [format, setFormat] = useState('xlsx');

  const { finalHeaders, finalRows } = buildFinalTable(headers, rows, meta, activeMetaKeys, columnMetaOrder, metaFields);
  const headerMetaFields = buildHeaderMetaFields(meta, activeMetaKeys, columnMetaOrder, metaFields);
  const exportMatrix = buildExportMatrix(headerMetaFields, finalHeaders, finalRows, showTable);

  const handleDownload = () => {
    const base = filename.replace(/\.[^.]+$/, '');
    if (format === 'csv') {
      downloadText(matrixToCSV(exportMatrix), `${base}.csv`, 'text/csv');
    } else {
      downloadXLSX(exportMatrix, `${base}.xlsx`);
    }
  };

  return (
    <div className="ocr-table-view">

      {/* Encabezado */}
      {headerMetaFields.length > 0 && (
        <div className="ocr-meta-table-wrap">
          <table className="ocr-meta-table">
            <tbody>
              {headerMetaFields.map(({ key, label }) => (
                <tr key={key}>
                  <td className="ocr-meta-table__label">{label}</td>
                  <td className="ocr-meta-table__value">{meta[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toolbar */}
      <div className="ocr-table-toolbar">
        <div className="ocr-table-info">
          {showTable
            ? <><strong>{finalRows.length}</strong> filas · <strong>{finalHeaders.length}</strong> columnas</>
            : <span>Solo encabezado</span>
          }
        </div>
        <div className="ocr-table-actions">
          <div className="ocr-fmt-toggle">
            {['xlsx', 'csv'].map(f => (
              <button
                key={f}
                className={`ocr-fmt-btn ${format === f ? 'active' : ''}`}
                onClick={() => setFormat(f)}
              >
                {f === 'xlsx' ? 'Excel' : 'CSV'}
              </button>
            ))}
          </div>
          <button className="ocr-btn-primary" onClick={handleDownload}>Descargar</button>
          <button className="ocr-btn-ghost" onClick={onReset}>Nueva extracción</button>
        </div>
      </div>

      {/* Tabla */}
      {showTable && (
        <div className="ocr-table-wrapper">
          <table className="ocr-table">
            <thead>
              <tr>
                <th>#</th>
                {finalHeaders.map((h, i) => <th key={i}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {finalRows.map((row, ri) => (
                <tr key={ri}>
                  <td>{ri + 1}</td>
                  {finalHeaders.map((_, ci) => (
                    <td key={ci}>{row[ci] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
