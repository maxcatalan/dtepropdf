import { useState } from 'react';

export default function CustomFieldsPanel({
  fields,
  onAdd,
  onRemove,
  showTable,
  onToggleTable,
  readOnly = false,
}) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const existing = new Set(fields.map(({ key }) => key.toLowerCase()));
    const labels = input
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((label) => {
        const normalized = label.toLowerCase();
        if (existing.has(normalized)) return false;
        existing.add(normalized);
        return true;
      });

    if (labels.length === 0) return;
    labels.forEach(onAdd);
    setInput('');
  };

  return (
    <div className={`ocr-options ${readOnly ? 'is-readonly' : ''}`}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="ocr-custom-helper">
        <span className="ocr-custom-helper__eyebrow">Paso 1</span>
        <p className="ocr-options__title">Qué quieres extraer</p>
        {!readOnly && (
          <p className="ocr-custom-hint">
            Escribe los campos que quieres ver en el resultado. Sepáralos por coma para agregar varios a la vez.
          </p>
        )}
        {readOnly && (
          <p className="ocr-custom-hint">Modo solo lectura — estos campos se usarán en la extracción.</p>
        )}
      </div>

      {/* ── Add field input ──────────────────────────────────────── */}
      {!readOnly && (
        <div className="ocr-custom-add-row">
          <input
            type="text"
            className="ocr-custom-input"
            placeholder="Ej: Orden de compra, Centro de costo, Patente"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            className="ocr-btn-primary ocr-custom-add-btn"
            onClick={handleAdd}
            disabled={!input.trim()}
          >
            Agregar
          </button>
        </div>
      )}

      {/* ── Field list ───────────────────────────────────────────── */}
      {fields.length > 0 ? (
        <>
          <p className="ocr-custom-count">
            {fields.length} campo{fields.length === 1 ? '' : 's'} seleccionado{fields.length === 1 ? '' : 's'}
          </p>
          <ul className="ocr-custom-list">
            {fields.map(({ key, label }) => (
              <li key={key} className="ocr-custom-item">
                <span className="ocr-custom-item__label">{label}</span>
                {!readOnly && (
                  <button
                    className="ocr-custom-item__remove"
                    onClick={() => onRemove(key)}
                    aria-label={`Eliminar ${label}`}
                    title="Eliminar"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        !readOnly && (
          <p className="ocr-custom-hint ocr-custom-hint--compact" style={{ fontStyle: 'italic' }}>
            Aún no hay campos. Escríbelos arriba.
          </p>
        )
      )}

      {/* ── Table toggle ─────────────────────────────────────────── */}
      <label className="ocr-option-row" style={{ marginTop: '0.5rem' }}>
        <input
          type="checkbox"
          checked={showTable}
          onChange={readOnly ? undefined : onToggleTable}
          disabled={readOnly}
        />
        <div className="ocr-option-group__header">
          <span className="ocr-option-group__label">Incluir tabla principal</span>
          <span className="ocr-option-group__desc">Productos, cantidades, precios y columnas del documento.</span>
        </div>
      </label>


    </div>
  );
}
