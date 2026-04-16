import { useState } from 'react';
import { ALL_META_FIELDS } from '../ocrConstants';

const PLACEHOLDER_COLS = 3;
const PLACEHOLDER_ROWS = 4;

const SAMPLE_VALUES = {
  folio:            '10342',
  fecha:            '14/04/2026',
  nombre_proveedor: 'Distribuidora Sur S.A.',
  rut_proveedor:    '76.543.210-K',
  iva:              '19.380',
  monto_total:      '121.380',
};

const SKEL_WIDTHS = [
  [68, 45, 82],
  [50, 72, 38],
  [80, 55, 65],
  [42, 68, 50],
];

function SampleValue({ value }) {
  return (
    <>
      <span className="ocr-strprev__sample-val">{value}</span>
      <span className="ocr-strprev__sample-tag">dato de muestra</span>
    </>
  );
}

function GripHandle() {
  return <span className="ocr-strprev__grip" aria-hidden="true" />;
}

// Returns which slot index (0..n) the mouse X maps to, based on rendered col positions
function getInsertIndex(clientX, colKeys) {
  for (let i = 0; i < colKeys.length; i++) {
    const el = document.querySelector(`[data-col-key="${colKeys[i]}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) return i;
  }
  return colKeys.length;
}

export default function OcrStructurePreview({
  activeMetaKeys,
  columnMetaOrder = [],
  showTable,
  onMoveToColumn,
  onMoveToHeader,
  onReorderColumns,
  metaFields = ALL_META_FIELDS,
  readOnly = false,
}) {
  const [dragging, setDragging]           = useState(null);   // { key, from }
  const [dragOverHeader, setDragOverHeader] = useState(false);
  const [insertIndex, setInsertIndex]     = useState(null);   // slot index in colFields
  const [tableDragActive, setTableDragActive] = useState(false);

  const columnMetaKeys = new Set(columnMetaOrder);
  const headerFields   = metaFields.filter(f => activeMetaKeys.has(f.key) && !columnMetaKeys.has(f.key));
  const colFields      = columnMetaOrder.map(k => metaFields.find(f => f.key === k)).filter(Boolean);
  const colKeys        = colFields.map(f => f.key);

  // ── drag lifecycle ───────────────────────────────────────────────────────
  const onDragStart = (e, key, from) => {
    if (readOnly) return;
    e.dataTransfer.setData('key', key);
    e.dataTransfer.setData('from', from);
    e.dataTransfer.effectAllowed = 'move';
    setDragging({ key, from });
  };
  const onDragEnd = () => {
    setDragging(null);
    setDragOverHeader(false);
    setInsertIndex(null);
    setTableDragActive(false);
  };

  // ── header zone ───────────────────────────────────────────────────────────
  const onHeaderDragOver  = (e) => { e.preventDefault(); setDragOverHeader(true); };
  const onHeaderDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverHeader(false);
  };
  const onHeaderDrop = (e) => {
    if (readOnly) return;
    e.preventDefault();
    setDragOverHeader(false);
    setDragging(null);
    const key  = e.dataTransfer.getData('key');
    const from = e.dataTransfer.getData('from');
    if (from === 'table') onMoveToHeader(key);
  };

  // ── table zone (entire table is the drop target) ─────────────────────────
  const onTableDragOver = (e) => {
    if (readOnly) return;
    e.preventDefault();
    setTableDragActive(true);
    const idx = getInsertIndex(e.clientX, colKeys);
    setInsertIndex(idx);
  };
  const onTableDragLeave = (e) => {
    if (readOnly) return;
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setTableDragActive(false);
      setInsertIndex(null);
    }
  };
  const onTableDrop = (e) => {
    if (readOnly) return;
    e.preventDefault();
    setTableDragActive(false);
    setDragging(null);
    const key  = e.dataTransfer.getData('key');
    const from = e.dataTransfer.getData('from');
    const idx  = getInsertIndex(e.clientX, colKeys);
    setInsertIndex(null);

    if (from === 'header') {
      onMoveToColumn(key);
      // after state updates, reorder to the right position
      setTimeout(() => {
        const newOrder = [...columnMetaOrder, key];
        if (idx < newOrder.length - 1) {
          // need to place at idx, but onReorderColumns works relative to existing cols
          const targetKey = newOrder[idx];
          if (targetKey) onReorderColumns(key, targetKey, 'left');
        }
      }, 0);
    } else if (from === 'table') {
      const sourceIdx = colKeys.indexOf(key);
      // adjust for the fact that removing source shifts indices
      const adjustedIdx = idx > sourceIdx ? idx - 1 : idx;
      if (adjustedIdx === sourceIdx) return; // no change
      const targetKey = colKeys.filter(k => k !== key)[adjustedIdx] ?? colKeys[colKeys.length - 1];
      const side = idx > sourceIdx ? 'right' : 'left';
      if (targetKey) onReorderColumns(key, targetKey, side);
    }
  };

  const noActive = activeMetaKeys.size === 0 && !showTable;
  if (noActive) return null;

  const isDraggingFromTable  = dragging?.from === 'table';
  const isDraggingAnything   = !!dragging;

  // Per-column transform: shift right to open gap at insertIndex
  const getColStyle = (key, idx) => {
    if (!tableDragActive || insertIndex === null || !isDraggingAnything) return {};
    const sourceIdx = colKeys.indexOf(dragging?.key ?? '');
    if (key === dragging?.key) return {}; // source handled by opacity

    // When inserting from header at position 0, the prepend zone cell handles the visual gap —
    // don't also shift columns or there's a double-gap effect.
    if (insertIndex === 0 && sourceIdx < 0) return {};

    // Figure out where this column will end up relative to the insertion gap
    const effectiveSource = sourceIdx >= 0 ? sourceIdx : colKeys.length;
    // Columns that need to shift right to open space
    const needsShift = idx >= insertIndex && (sourceIdx < 0 || idx < effectiveSource);
    // Columns that need to shift left because source is being moved away from before them
    const needsUnshift = sourceIdx >= 0 && idx > effectiveSource && idx < insertIndex;

    if (needsShift)   return { transform: 'translateX(20px)' };
    if (needsUnshift) return { transform: 'translateX(-20px)' };
    return {};
  };

  return (
    <div className="ocr-strprev">
      <div className="ocr-strprev__topbar">
        <span className="ocr-strprev__preview-label">Vista previa de extracción</span>
        <span className="ocr-strprev__preview-hint">
          {readOnly
            ? 'Vista solo lectura de la plantilla seleccionada'
            : 'Arrastra campos del encabezado a la tabla para agregarlos como columnas'}
        </span>
      </div>

      <div className="ocr-strprev__body">

        {/* Header section */}
        {activeMetaKeys.size > 0 && (
          <div
            className={`ocr-strprev__header-section ${dragOverHeader && isDraggingFromTable ? 'is-drag-over' : ''}`}
            onDragOver={readOnly ? undefined : onHeaderDragOver}
            onDragLeave={readOnly ? undefined : onHeaderDragLeave}
            onDrop={readOnly ? undefined : onHeaderDrop}
          >
            <span className="ocr-strprev__section-label">Encabezado</span>
            {headerFields.length === 0 ? (
              <p className={`ocr-strprev__empty ${dragOverHeader ? 'is-active' : ''}`}>
                {dragOverHeader ? 'Suelta aquí para volver al encabezado' : 'Todos los campos están en la tabla'}
              </p>
            ) : (
              <table className="ocr-strprev__htable">
                <tbody>
                  {headerFields.map(({ key, label }) => (
                    <tr
                      key={key}
                      className={`ocr-strprev__hrow ${dragging?.key === key ? 'is-dragging' : ''}`}
                      draggable={!readOnly}
                      onDragStart={e => onDragStart(e, key, 'header')}
                      onDragEnd={onDragEnd}
                    >
                      <td className="ocr-strprev__hrow-handle">{!readOnly && <GripHandle />}</td>
                      <td className="ocr-strprev__hrow-label">{label}</td>
                      <td className="ocr-strprev__hrow-value"><SampleValue value={SAMPLE_VALUES[key] || '—'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeMetaKeys.size > 0 && showTable && <div className="ocr-strprev__separator" />}

        {/* Table section — entire zone is the drop target */}
        {showTable && (
          <div
            className={`ocr-strprev__table-section ${tableDragActive ? 'is-drag-active' : ''}`}
            onDragOver={readOnly ? undefined : onTableDragOver}
            onDragLeave={readOnly ? undefined : onTableDragLeave}
            onDrop={readOnly ? undefined : onTableDrop}
          >
            <span className="ocr-strprev__section-label">Tabla principal</span>
            <div className="ocr-strprev__table-wrap">
              <table className="ocr-strprev__table">
                <thead>
                  <tr>
                    <th className="ocr-strprev__th-index">#</th>
                    {Array.from({ length: PLACEHOLDER_COLS }).map((_, i) => (
                      <th key={i} className="ocr-strprev__th-placeholder">
                        <div className="ocr-strprev__skel ocr-strprev__skel--th" />
                      </th>
                    ))}
                    {/* Prepend zone — insert-at-beginning indicator */}
                    {tableDragActive && insertIndex === 0 && colFields.length > 0 && (
                      <th className="ocr-strprev__th-append is-active" />
                    )}
                    {colFields.map(({ key, label }, idx) => (
                      <th
                        key={key}
                        data-col-key={key}
                        className={[
                          'ocr-strprev__th-meta',
                          dragging?.key === key ? 'is-dragging-source' : '',
                          tableDragActive && insertIndex === idx && idx > 0 ? 'drop-left' : '',
                        ].join(' ')}
                        style={getColStyle(key, idx)}
                      >
                        <div
                          className={`ocr-strprev__col-chip ${dragging?.key === key ? 'is-dragging' : ''}`}
                          draggable={!readOnly}
                          onDragStart={e => onDragStart(e, key, 'table')}
                          onDragEnd={onDragEnd}
                        >
                          {!readOnly && <GripHandle />}
                          {label}
                        </div>
                      </th>
                    ))}
                    {/* Insertion indicator at the end */}
                    {tableDragActive && insertIndex === colFields.length && (
                      <th className="ocr-strprev__th-append is-active" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: PLACEHOLDER_ROWS }).map((_, ri) => (
                    <tr key={ri}>
                      <td className="ocr-strprev__td-index">{ri + 1}</td>
                      {Array.from({ length: PLACEHOLDER_COLS }).map((_, ci) => (
                        <td key={ci}>
                          <div className="ocr-strprev__skel" style={{ width: `${SKEL_WIDTHS[ri]?.[ci] ?? 60}%` }} />
                        </td>
                      ))}
                      {/* Prepend zone body cell */}
                      {tableDragActive && insertIndex === 0 && colFields.length > 0 && (
                        <td className="ocr-strprev__td-append" />
                      )}
                      {colFields.map(({ key }, idx) => (
                        <td
                          key={key}
                          className={[
                            'ocr-strprev__td-meta',
                            dragging?.key === key ? 'is-dragging-source' : '',
                            tableDragActive && insertIndex === idx && idx > 0 ? 'drop-left' : '',
                          ].join(' ')}
                          style={getColStyle(key, idx)}
                        >
                          <SampleValue value={SAMPLE_VALUES[key] || '—'} />
                        </td>
                      ))}
                      {tableDragActive && insertIndex === colFields.length && (
                        <td className="ocr-strprev__td-append" />
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
