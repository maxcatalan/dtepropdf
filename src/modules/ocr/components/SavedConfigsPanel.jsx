import { useState, useRef, useEffect } from 'react';
import AutoDetectRuleEditor from './AutoDetectRuleEditor';
import {
  AUTO_DETECT_RULE_MODE,
  buildAutoDetectTriggers,
  isAutoDetectRuleValid,
} from './autoDetectRules';

const MAX = 50;

export default function SavedConfigsPanel({
  configs,
  currentFields,
  currentShowTable,
  currentColOrder,
  loadedConfig,
  detectedConfigName,
  defaultOpen = false,
  allowExistingTemplateManagement = false,
  onLoad,
  onSave,
  onUpdate,
  onDelete,
  onUpdateTriggers,
}) {
  const [open, setOpen]                   = useState(defaultOpen);
  const [saving, setSaving]               = useState(false);
  const [saveName, setSaveName]           = useState('');
  const [showSaveForm, setShowSaveForm]   = useState(false);
  const [draftField, setDraftField]       = useState('');
  const [draftValue, setDraftValue]       = useState('');
  const [draftForId, setDraftForId]       = useState(null);
  const [panelError, setPanelError]       = useState('');

  // Save dropdown — trigger fields
  const [saveTriggerField, setSaveTriggerField]   = useState('');
  const [saveTriggerValue, setSaveTriggerValue]   = useState('');
  const [saveAutoDetectMode, setSaveAutoDetectMode] = useState(AUTO_DETECT_RULE_MODE.OFF);

  // Rename state: configId being renamed → draft name
  const [renamingId, setRenamingId]     = useState(null);
  const [renameDraft, setRenameDraft]   = useState('');
  const [renaming, setRenaming]         = useState(false);

  // Overwrite state
  const [overwritingId, setOverwritingId] = useState(null);

  // Loaded config update
  const [updatingLoaded, setUpdatingLoaded] = useState(false);

  const dropdownRef = useRef(null);

  const canSave = currentFields.length > 0 || currentShowTable;

  const isDirty = loadedConfig != null && (
    JSON.stringify(currentFields)    !== JSON.stringify(loadedConfig.fields     || []) ||
    currentShowTable                 !== (loadedConfig.show_table ?? true)             ||
    JSON.stringify(currentColOrder)  !== JSON.stringify(loadedConfig.col_order  || [])
  );

  // Close save dropdown on outside click
  useEffect(() => {
    if (!showSaveForm) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSaveForm(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSaveForm]);

  async function handleUpdateLoaded() {
    if (!loadedConfig) return;
    setUpdatingLoaded(true);
    setPanelError('');
    try {
      await onUpdate(loadedConfig.id, {
        name: loadedConfig.name,
        fields: currentFields,
        show_table: currentShowTable,
        col_order: currentColOrder,
      });
    } catch (e) {
      setPanelError(e.message);
    } finally {
      setUpdatingLoaded(false);
    }
  }

  function openSaveForm() {
    setSaveName('');
    setSaveTriggerField('');
    setSaveTriggerValue('');
    setSaveAutoDetectMode(AUTO_DETECT_RULE_MODE.OFF);
    setPanelError('');
    setShowSaveForm(true);
  }

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true);
    setPanelError('');
    try {
      const triggers = buildAutoDetectTriggers(saveAutoDetectMode, saveTriggerField, saveTriggerValue);
      await onSave(saveName.trim(), triggers);
      setShowSaveForm(false);
    } catch (e) {
      setPanelError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function startRename(config) {
    setRenamingId(config.id);
    setRenameDraft(config.name);
  }

  async function commitRename(config) {
    if (!renameDraft.trim() || renameDraft.trim() === config.name) {
      setRenamingId(null);
      return;
    }
    setRenaming(true);
    setPanelError('');
    try {
      await onUpdate(config.id, {
        name: renameDraft.trim(),
        fields: config.fields,
        show_table: config.show_table,
        col_order: config.col_order,
      });
      setRenamingId(null);
    } catch (e) {
      setPanelError(e.message);
    } finally {
      setRenaming(false);
    }
  }

  async function handleOverwrite(config) {
    setOverwritingId(config.id);
    setPanelError('');
    try {
      await onUpdate(config.id, {
        name: config.name,
        fields: currentFields,
        show_table: currentShowTable,
        col_order: currentColOrder,
      });
    } catch (e) {
      setPanelError(e.message);
    } finally {
      setOverwritingId(null);
    }
  }

  async function handleDelete(id) {
    setPanelError('');
    try {
      await onDelete(id);
    } catch (e) {
      setPanelError(e.message);
    }
  }

  async function handleAddTrigger(config) {
    if (!draftField.trim() || !draftValue.trim()) return;
    const next = [...(config.triggers || []), {
      match_type: AUTO_DETECT_RULE_MODE.FIELD_VALUE,
      field_name: draftField.trim(),
      field_value: draftValue.trim(),
    }];
    setPanelError('');
    try {
      await onUpdateTriggers(config.id, next);
      setDraftField('');
      setDraftValue('');
      setDraftForId(null);
    } catch (e) {
      setPanelError(e.message);
    }
  }

  async function handleRemoveTrigger(config, idx) {
    const next = (config.triggers || []).filter((_, i) => i !== idx);
    setPanelError('');
    try {
      await onUpdateTriggers(config.id, next);
    } catch (e) {
      setPanelError(e.message);
    }
  }

  return (
    <div className="ocr-configs">
      {/* ── Action bar ───────────────────────────────────────── */}
      <div className="ocr-configs__bar">
        {allowExistingTemplateManagement && (
          <button
            className={`ocr-btn-ghost ocr-configs__toggle ${open ? 'is-active' : ''}`}
            onClick={() => setOpen(v => !v)}
          >
            Mis plantillas
            {configs.length > 0 && <span className="ocr-configs__badge">{configs.length}</span>}
            <span className="ocr-configs__chevron">{open ? '▴' : '▾'}</span>
          </button>
        )}

        {/* ── Save button + dropdown ──────────────────────────── */}
        <div className="ocr-configs__save-wrapper" ref={dropdownRef}>
          <button
            className={`ocr-btn-ghost ${showSaveForm ? 'is-active' : ''}`}
            disabled={!canSave}
            onClick={openSaveForm}
            title={canSave ? 'Guarda los campos actuales como una plantilla reutilizable' : 'Agrega campos primero'}
          >
            Guardar plantilla actual
          </button>

          {showSaveForm && (
            <div className="ocr-configs__save-dropdown">
              {/* Config name */}
              <div className="ocr-configs__save-field">
                <label className="ocr-configs__save-label">
                  Nombre de la plantilla
                  <span
                    className="ocr-configs__tooltip-icon"
                    data-tooltip="Dale un nombre descriptivo para identificar esta plantilla más adelante (ej: Facturas Proveedor ABC)."
                  >?</span>
                </label>
                <input
                  className="ocr-custom-input"
                  placeholder="Ej: Facturas Proveedor ABC…"
                  value={saveName}
                  autoFocus
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveForm(false); }}
                />
              </div>

              <AutoDetectRuleEditor
                mode={saveAutoDetectMode}
                fieldName={saveTriggerField}
                fieldValue={saveTriggerValue}
                onModeChange={setSaveAutoDetectMode}
                onFieldNameChange={setSaveTriggerField}
                onFieldValueChange={setSaveTriggerValue}
                title="Habilitar auto-detección para esta plantilla"
                description="Si la activas ahora, luego esta plantilla podrá ser encontrada automáticamente en el submódulo de usar plantilla guardada."
              />

              {panelError && <p className="ocr-configs__error">{panelError}</p>}

              <div className="ocr-configs__save-actions">
                <button
                  className="ocr-btn-primary"
                  onClick={handleSave}
                  disabled={!saveName.trim() || saving || !isAutoDetectRuleValid(saveAutoDetectMode, saveTriggerField, saveTriggerValue)}
                >
                  {saving ? '…' : 'Guardar'}
                </button>
                <button className="ocr-btn-ghost" onClick={() => setShowSaveForm(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {isDirty && (
          <button
            className="ocr-btn-primary ocr-configs__update-loaded"
            onClick={handleUpdateLoaded}
            disabled={updatingLoaded}
          >
            {updatingLoaded ? '…' : `↑ Actualizar cambios en "${loadedConfig.name}"`}
          </button>
        )}

        {detectedConfigName && (
          <span className="ocr-configs__detected">
            <span className="ocr-configs__detected-dot" />
            Plantilla aplicada automáticamente: <strong>{detectedConfigName}</strong>
          </span>
        )}
      </div>

      {panelError && !showSaveForm && <p className="ocr-configs__error">{panelError}</p>}

      {!allowExistingTemplateManagement && (
        <p className="ocr-configs__helper">
          Las plantillas existentes se editan desde la opción `Editar plantilla guardada`.
        </p>
      )}

      {/* ── List panel ───────────────────────────────────────── */}
      {allowExistingTemplateManagement && open && (
        <div className="ocr-configs__panel">
          {configs.length === 0 ? (
            <p className="ocr-configs__hint">
              No tienes plantillas guardadas aún. Ajusta los campos y presiona "Guardar plantilla actual".
            </p>
          ) : (
            <>
              <ul className="ocr-configs__list">
                {configs.map(config => (
                  <li key={config.id} className="ocr-configs__item">
                    <div className="ocr-configs__item-row">
                      <div className="ocr-configs__item-info">
                        {renamingId === config.id ? (
                          <input
                            className="ocr-custom-input ocr-configs__rename-input"
                            value={renameDraft}
                            autoFocus
                            onChange={e => setRenameDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRename(config);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onBlur={() => commitRename(config)}
                            disabled={renaming}
                          />
                        ) : (
                          <span className="ocr-configs__item-name">{config.name}</span>
                        )}
                        <span className="ocr-configs__item-meta">
                          {(config.fields?.length ?? 0)} campo{config.fields?.length !== 1 ? 's' : ''}
                          {(config.triggers?.length ?? 0) > 0 &&
                            ` · ${config.triggers.length} regla${config.triggers.length !== 1 ? 's' : ''} automática${config.triggers.length !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <div className="ocr-configs__item-actions">
                        <button
                          className="ocr-btn-ghost ocr-btn-sm"
                          onClick={() => { onLoad(config); setOpen(false); }}
                        >
                          Usar
                        </button>
                        <button
                          className="ocr-btn-ghost ocr-btn-sm"
                          onClick={() => startRename(config)}
                          title="Renombrar plantilla"
                          disabled={renamingId === config.id}
                        >
                          ✎
                        </button>
                        <button
                          className="ocr-btn-ghost ocr-btn-sm"
                          onClick={() => handleOverwrite(config)}
                          title="Reemplazar los campos guardados con los campos actuales del workspace"
                          disabled={!canSave || overwritingId === config.id}
                        >
                          {overwritingId === config.id ? '…' : '↑ Sobrescribir'}
                        </button>
                        <button
                          className="ocr-btn-ghost ocr-btn-sm ocr-btn-danger"
                          onClick={() => handleDelete(config.id)}
                          title="Eliminar plantilla"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* ── Triggers — siempre visibles ───────────────── */}
                    <div className="ocr-configs__triggers-inline">
                      {(config.triggers || []).map((t, i) => (
                        <span key={i} className="ocr-configs__trigger-chip">
                          <span className="ocr-configs__trigger-chip-field">
                            {t.match_type === AUTO_DETECT_RULE_MODE.VALUE_ONLY ? 'Valor específico' : t.field_name}
                          </span>
                          <span className="ocr-configs__trigger-chip-eq">=</span>
                          <span className="ocr-configs__trigger-chip-val">{t.field_value}</span>
                          <button
                            className="ocr-configs__trigger-chip-remove"
                            onClick={() => handleRemoveTrigger(config, i)}
                            title="Eliminar disparador"
                          >×</button>
                        </span>
                      ))}

                      {draftForId === config.id ? (
                        <>
                          <input
                            className="ocr-custom-input ocr-configs__trigger-draft-input"
                            placeholder="Campo (ej: RUT)"
                            value={draftField}
                            autoFocus
                            onChange={e => setDraftField(e.target.value)}
                            onKeyDown={e => e.key === 'Escape' && setDraftForId(null)}
                          />
                          <input
                            className="ocr-custom-input ocr-configs__trigger-draft-input"
                            placeholder="Valor esperado"
                            value={draftValue}
                            onChange={e => setDraftValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddTrigger(config)}
                          />
                          <button
                            className="ocr-btn-primary ocr-btn-sm"
                            onClick={() => handleAddTrigger(config)}
                            disabled={!draftField.trim() || !draftValue.trim()}
                          >+</button>
                          <button
                            className="ocr-btn-ghost ocr-btn-sm"
                            onClick={() => { setDraftForId(null); setDraftField(''); setDraftValue(''); }}
                          >✕</button>
                        </>
                      ) : (
                        <button
                          className="ocr-btn-ghost ocr-btn-sm ocr-configs__trigger-add-btn"
                          onClick={() => { setDraftForId(config.id); setDraftField(''); setDraftValue(''); }}
                          title="Agregar regla de auto-detección"
                        >+ regla automática</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="ocr-configs__count">{configs.length} / {MAX} plantillas</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
