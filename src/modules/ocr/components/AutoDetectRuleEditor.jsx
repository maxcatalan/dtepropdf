import { AUTO_DETECT_RULE_MODE } from './autoDetectRules';

export default function AutoDetectRuleEditor({
  mode,
  fieldName,
  fieldValue,
  onModeChange,
  onFieldNameChange,
  onFieldValueChange,
  title = 'Auto-detección para esta plantilla',
  description = 'Esto se usará cuando luego entres a "Usar plantilla guardada" y elijas el modo de auto-detección.',
}) {
  return (
    <section className="ocr-autodetect-editor">
      <div className="ocr-autodetect-editor__header">
        <span className="ocr-autodetect-editor__eyebrow">Auto-detección</span>
        <h4 className="ocr-autodetect-editor__title">{title}</h4>
        <p className="ocr-autodetect-editor__desc">{description}</p>
      </div>

      <div className="ocr-autodetect-editor__modes">
        <button
          type="button"
          className={`ocr-autodetect-editor__mode ${mode === AUTO_DETECT_RULE_MODE.OFF ? 'is-active' : ''}`}
          onClick={() => onModeChange(AUTO_DETECT_RULE_MODE.OFF)}
        >
          No usar auto-detección
        </button>

        <button
          type="button"
          className={`ocr-autodetect-editor__mode ${mode === AUTO_DETECT_RULE_MODE.FIELD_VALUE ? 'is-active' : ''}`}
          onClick={() => onModeChange(AUTO_DETECT_RULE_MODE.FIELD_VALUE)}
        >
          <span>Campo + valor</span>
          <small>Recomendado</small>
        </button>

        <button
          type="button"
          className={`ocr-autodetect-editor__mode ${mode === AUTO_DETECT_RULE_MODE.VALUE_ONLY ? 'is-active is-warning' : ''}`}
          onClick={() => onModeChange(AUTO_DETECT_RULE_MODE.VALUE_ONLY)}
        >
          <span>Solo un valor específico</span>
          <small>Menos recomendado</small>
        </button>
      </div>

      {mode === AUTO_DETECT_RULE_MODE.FIELD_VALUE && (
        <div className="ocr-autodetect-editor__body">
          <div className="ocr-autodetect-editor__field">
            <label className="ocr-autodetect-editor__label">Campo a revisar</label>
            <input
              className="ocr-custom-input"
              placeholder="Ej: Proveedor, Emisor, Centro de costo"
              value={fieldName}
              onChange={(event) => onFieldNameChange(event.target.value)}
            />
          </div>

          <div className="ocr-autodetect-editor__field">
            <label className="ocr-autodetect-editor__label">Valor esperado en ese campo</label>
            <input
              className="ocr-custom-input"
              placeholder="Ej: Empresa ABC S.A."
              value={fieldValue}
              onChange={(event) => onFieldValueChange(event.target.value)}
            />
          </div>

          <p className="ocr-autodetect-editor__hint">
            Esta opción busca un campo concreto dentro del documento y verifica que contenga ese valor.
          </p>
        </div>
      )}

      {mode === AUTO_DETECT_RULE_MODE.VALUE_ONLY && (
        <div className="ocr-autodetect-editor__body">
          <div className="ocr-autodetect-editor__field">
            <label className="ocr-autodetect-editor__label">Valor específico a encontrar</label>
            <input
              className="ocr-custom-input"
              placeholder="Ej: 76123456-7 o Empresa ABC S.A."
              value={fieldValue}
              onChange={(event) => onFieldValueChange(event.target.value)}
            />
          </div>

          <p className="ocr-autodetect-editor__hint is-warning">
            Úsalo solo si no puedes confiar en el nombre del campo. Es menos preciso porque el sistema buscará ese valor en cualquier parte del documento.
          </p>
        </div>
      )}
    </section>
  );
}
