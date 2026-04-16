import { useState, useEffect } from 'react';
import OcrUploadPanel from './components/OcrUploadPanel';
import OcrTableView from './components/OcrTableView';
import OcrStructurePreview from './components/OcrStructurePreview';
import CustomFieldsPanel from './components/CustomFieldsPanel';
import SavedConfigsPanel from './components/SavedConfigsPanel';
import ConfigPickerPanel from './components/ConfigPickerPanel';
import AutoDetectRuleEditor from './components/AutoDetectRuleEditor';
import OcrApiPanel from './components/OcrApiPanel';
import {
  AUTO_DETECT_RULE_MODE,
  buildAutoDetectTriggers,
  getAutoDetectRuleState,
  isAutoDetectRuleValid,
} from './components/autoDetectRules';
import { fileToBase64, extractCustomWithBase64 } from './services/customGeminiOcr';
import { listConfigs, createConfig, deleteConfig, updateConfig, updateTriggers } from '../../services/extractionConfigs';
import { useAuth } from '../../context/AuthContext';
import './ocr.css';

const STATE = { IDLE: 'idle', DETECTING: 'detecting', LOADING: 'loading', DONE: 'done', ERROR: 'error' };
// mode: null = selector | 'new' = crear | 'edit' = editar | 'load' = cargar | 'extract' = rápida | 'api' = integración
const MODE = { NEW: 'new', EDIT: 'edit', LOAD: 'load', EXTRACT: 'extract', API: 'api' };

const MODE_COPY = {
  [MODE.NEW]: {
    eyebrow: 'Plantilla nueva',
    title: 'Crea una plantilla probándola con un documento real',
    description: 'Define los campos que te interesan, decide si quieres incluir la tabla y luego prueba la extracción con un solo archivo.',
    steps: [
      'Agrega los campos que quieres ver en el resultado.',
      'Decide si también quieres la tabla principal.',
      'Sube un documento y revisa el resultado antes de guardar la plantilla.',
    ],
  },
  [MODE.EDIT]: {
    eyebrow: 'Editar plantilla',
    title: 'Ajusta una plantilla que ya usas',
    description: 'Primero elige una plantilla guardada. Después podrás cambiar campos, ordenar columnas y probarla nuevamente.',
    steps: [
      'Selecciona una plantilla guardada.',
      'Agrega, quita o reordena campos según necesites.',
      'Sube un documento para validar que quedó bien.',
    ],
  },
  [MODE.LOAD]: {
    eyebrow: 'Usar plantilla',
    title: 'Reutiliza una plantilla guardada',
    description: 'Ideal si siempre procesas documentos parecidos y ya definiste qué información te importa.',
    steps: [
      'Selecciona una plantilla guardada.',
      'Sube el documento a procesar.',
      'Descarga el resultado en Excel o CSV.',
    ],
  },
  [MODE.EXTRACT]: {
    eyebrow: 'Extracción rápida',
    title: 'Prueba rápida sin crear plantilla',
    description: 'El sistema puede intentar detectar campos generales y/o la tabla principal sin que tengas que configurar nada antes.',
    steps: [
      'Marca si quieres campos generales, tabla o ambas cosas.',
      'Sube un documento.',
      'Revisa el resultado y, si te sirve, luego puedes convertirlo en plantilla.',
    ],
  },
};

function humanJoin(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

export default function CustomOcrModule() {
  const { session, refreshCredits } = useAuth();
  const userId = session?.user?.id;

  const [state, setState]   = useState(STATE.IDLE);
  const [file, setFile]     = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState('');
  const [saveChangesError, setSaveChangesError]   = useState('');
  const [savingLoadedConfig, setSavingLoadedConfig] = useState(false);
  const [autoDetectMatch, setAutoDetectMatch]     = useState(null);

  // Mode selector
  const [mode, setMode] = useState(null);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(
    () => localStorage.getItem('ocr_autodetect') !== 'false'
  );

  // Extract mode options
  const [extractMeta, setExtractMeta]   = useState(true);
  const [extractTable, setExtractTable] = useState(true);

  // Custom fields
  const [customFields, setCustomFields]       = useState([]);
  const [columnMetaOrder, setColumnMetaOrder] = useState([]);
  const [showTable, setShowTable]             = useState(true);
  const [postPrompt, setPostPrompt]           = useState('');

  // Saved configurations
  const [savedConfigs, setSavedConfigs]             = useState([]);
  const [detectedConfigName, setDetectedConfigName] = useState('');
  const [loadedConfig, setLoadedConfig]             = useState(null);
  const [loadedConfigTriggers, setLoadedConfigTriggers] = useState([]);
  const [loadedConfigAutoDetectMode, setLoadedConfigAutoDetectMode] = useState(AUTO_DETECT_RULE_MODE.OFF);
  const [loadedConfigTriggerField, setLoadedConfigTriggerField] = useState('');
  const [loadedConfigTriggerValue, setLoadedConfigTriggerValue] = useState('');

  // Derived
  const activeMetaKeys = new Set(customFields.map(f => f.key));

  // ── Load saved configs on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    listConfigs(userId).then(setSavedConfigs).catch(() => {});
  }, [userId]);

  // ── Mode ─────────────────────────────────────────────────────────────────────
  const selectMode = (m) => {
    setMode(m);
    setCustomFields([]);
    setColumnMetaOrder([]);
    setShowTable(true);
    setPostPrompt('');
    setLoadedConfig(null);
    setLoadedConfigTriggers([]);
    setLoadedConfigAutoDetectMode(AUTO_DETECT_RULE_MODE.OFF);
    setLoadedConfigTriggerField('');
    setLoadedConfigTriggerValue('');
    setDetectedConfigName('');
    setAutoDetectMatch(null);
    setState(STATE.IDLE);
    setResult(null);
    setError('');
    setSaveChangesError('');
  };

  const setLoadSelectionMode = (nextMode) => {
    const enableAutoDetect = nextMode === 'auto';
    localStorage.setItem('ocr_autodetect', enableAutoDetect ? 'true' : 'false');
    setAutoDetectEnabled(enableAutoDetect);
    setDetectedConfigName('');
    setResult(null);
    setError('');
    setSaveChangesError('');
    setAutoDetectMatch(null);

    if (enableAutoDetect) {
      setLoadedConfig(null);
      setLoadedConfigTriggers([]);
      setLoadedConfigAutoDetectMode(AUTO_DETECT_RULE_MODE.OFF);
      setLoadedConfigTriggerField('');
      setLoadedConfigTriggerValue('');
      setCustomFields([]);
      setColumnMetaOrder([]);
      setShowTable(true);
    }
  };

  const handleBack = () => {
    setMode(null);
    setCustomFields([]);
    setColumnMetaOrder([]);
    setShowTable(true);
    setPostPrompt('');
    setLoadedConfig(null);
    setLoadedConfigTriggers([]);
    setLoadedConfigAutoDetectMode(AUTO_DETECT_RULE_MODE.OFF);
    setLoadedConfigTriggerField('');
    setLoadedConfigTriggerValue('');
    setDetectedConfigName('');
    setAutoDetectMatch(null);
    setState(STATE.IDLE);
    setResult(null);
    setError('');
    setSaveChangesError('');
  };

  // ── Config management ────────────────────────────────────────────────────────
  const handleLoadConfig = (config) => {
    if (mode === MODE.LOAD) {
      localStorage.setItem('ocr_autodetect', 'false');
      setAutoDetectEnabled(false);
    }
    setCustomFields(config.fields || []);
    setShowTable(config.show_table ?? true);
    setColumnMetaOrder(config.col_order || []);
    setPostPrompt(config.post_prompt ?? '');
    setLoadedConfigTriggers(config.triggers || []);
    const triggerState = getAutoDetectRuleState(config.triggers || []);
    setLoadedConfigAutoDetectMode(triggerState.mode);
    setLoadedConfigTriggerField(triggerState.fieldName);
    setLoadedConfigTriggerValue(triggerState.fieldValue);
    setDetectedConfigName('');
    setAutoDetectMatch(null);
    setLoadedConfig(config);
    setResult(null);
    setError('');
    setSaveChangesError('');
    setState(STATE.IDLE);
  };

  const handleSaveConfig = async (name, triggers) => {
    const saved = await createConfig(userId, {
      name,
      fields: customFields,
      show_table: showTable,
      col_order: columnMetaOrder,
      triggers: triggers ?? [],
      post_prompt: postPrompt,
    });
    setSavedConfigs(prev => [saved, ...prev]);
    setLoadedConfig(null);
  };

  const handleUpdateConfig = async (configId, updates) => {
    const updated = await updateConfig(configId, userId, updates);
    setSavedConfigs(prev => prev.map(c => c.id === configId ? updated : c));
    if (loadedConfig?.id === configId) setLoadedConfig(updated);
  };

  const handleDeleteConfig = async (configId) => {
    await deleteConfig(configId, userId);
    setSavedConfigs(prev => prev.filter(c => c.id !== configId));
    if (loadedConfig?.id === configId) setLoadedConfig(null);
  };

  const handleUpdateTriggers = async (configId, triggers) => {
    const updated = await updateTriggers(configId, userId, triggers);
    setSavedConfigs(prev => prev.map(c => c.id === configId ? updated : c));
  };

  const handleSaveLoadedConfig = async () => {
    if (!loadedConfig) return;
    setSavingLoadedConfig(true);
    setSaveChangesError('');
    try {
      await handleUpdateConfig(loadedConfig.id, {
        name: loadedConfig.name,
        fields: customFields,
        show_table: showTable,
        col_order: columnMetaOrder,
        triggers: loadedConfigTriggers,
        post_prompt: postPrompt,
      });
      handleBack();
    } catch (err) {
      setSaveChangesError(err.message || 'No se pudieron guardar los cambios.');
    } finally {
      setSavingLoadedConfig(false);
    }
  };

  // ── Field management ─────────────────────────────────────────────────────────
  const addField = (label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setCustomFields((prev) => {
      if (prev.some((field) => field.key.toLowerCase() === trimmed.toLowerCase())) return prev;
      return [...prev, { key: trimmed, label: trimmed }];
    });
  };

  const removeField = (key) => {
    setCustomFields(prev => prev.filter(f => f.key !== key));
    setColumnMetaOrder(prev => prev.filter(k => k !== key));
  };

  // ── Column drag handlers ─────────────────────────────────────────────────────
  const moveToColumn  = (key) => setColumnMetaOrder(prev => prev.includes(key) ? prev : [...prev, key]);
  const moveToHeader  = (key) => setColumnMetaOrder(prev => prev.filter(k => k !== key));
  const reorderColumns = (fromKey, toKey, side) => {
    setColumnMetaOrder(prev => {
      const without  = prev.filter(k => k !== fromKey);
      const toIdx    = without.indexOf(toKey);
      const insertAt = side === 'right' ? toIdx + 1 : toIdx;
      return [...without.slice(0, insertAt), fromKey, ...without.slice(insertAt)];
    });
  };

  // ── Auto-detection helper ─────────────────────────────────────────────────────
  async function detectMatchingConfig(fileData, mimeType) {
    const withTriggers = savedConfigs.filter(c => c.triggers?.length > 0);
    if (!withTriggers.length) return null;
    try {
      const res = await fetch('/api/detect-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          fileData,
          mimeType,
          configs: withTriggers.map(c => ({ id: c.id, triggers: c.triggers })),
        }),
      });
      if (!res.ok) return null;
      const { matched_config_id, matched_pairs = [] } = await res.json();
      const matchedConfig = matched_config_id ? savedConfigs.find(c => c.id === matched_config_id) ?? null : null;
      return matchedConfig ? { config: matchedConfig, matchedPairs: matched_pairs } : null;
    } catch {
      return null;
    }
  }

  // ── Extraction ────────────────────────────────────────────────────────────────
  const handleFileSelected = async (selectedFile) => {
    setFile(selectedFile);
    setError('');
    setDetectedConfigName('');
    setSaveChangesError('');

    let fileData, mimeType;
    try {
      ({ data: fileData, mimeType } = await fileToBase64(selectedFile));
    } catch {
      setError('No se pudo leer el archivo.');
      setState(STATE.ERROR);
      return;
    }

    let effectiveFields    = customFields;
    let effectiveShowTable = showTable;
    let effectiveColOrder  = columnMetaOrder;

    // Auto-detection — only when globally enabled and in 'load' mode or fields are empty
    const configsWithTriggers = savedConfigs.filter(c => c.triggers?.length > 0);
    const shouldAutoDetect = autoDetectEnabled && mode === MODE.LOAD && !loadedConfig && configsWithTriggers.length > 0;
    if (shouldAutoDetect) {
      setState(STATE.DETECTING);
      const matched = await detectMatchingConfig(fileData, mimeType);
      if (matched) {
        effectiveFields    = matched.config.fields || [];
        effectiveShowTable = matched.config.show_table ?? true;
        effectiveColOrder  = matched.config.col_order || [];
        setCustomFields(effectiveFields);
        setShowTable(effectiveShowTable);
        setColumnMetaOrder(effectiveColOrder);
        setDetectedConfigName(matched.config.name);
        setAutoDetectMatch({
          configName: matched.config.name,
          matchedPairs: matched.matchedPairs || [],
        });
      } else {
        setAutoDetectMatch(null);
      }
    }

    setState(STATE.LOADING);
    try {
      const fieldLabels     = effectiveFields.map(f => f.label);
      const useGeneric      = mode === MODE.EXTRACT && extractMeta;
      const useTable        = mode === MODE.EXTRACT ? extractTable : effectiveShowTable;
      const effectivePrompt = mode === MODE.EXTRACT ? '' : postPrompt;
      const extracted       = await extractCustomWithBase64(
        session, fileData, mimeType, selectedFile.name, fieldLabels, useTable, useGeneric, effectivePrompt,
      );
      // In generic extract mode, populate customFields from returned meta keys
      if (useGeneric && extracted.meta) {
        const genericFields = Object.keys(extracted.meta).map(k => ({ key: k, label: k }));
        setCustomFields(genericFields);
      }
      setResult(extracted);
      setState(STATE.DONE);
      refreshCredits();
    } catch (err) {
      setError(err.message || 'No se pudo extraer el documento.');
      setState(STATE.ERROR);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError('');
    setDetectedConfigName('');
    setAutoDetectMatch(null);
    setState(STATE.IDLE);
    setSaveChangesError('');
  };

  const canExtract = mode === MODE.EXTRACT
    ? (extractMeta || extractTable)
    : customFields.length > 0 || showTable;

  const editModeReady = mode === MODE.EDIT && loadedConfig !== null;
  const loadModeReady = mode === MODE.LOAD && loadedConfig !== null;
  const loadAutoDetectMode = mode === MODE.LOAD && autoDetectEnabled;
  const showFieldEditor = mode === MODE.NEW || editModeReady || loadModeReady;
  const showConfigsPanel = mode === MODE.NEW;
  const showUpload = mode === MODE.EXTRACT || mode === MODE.NEW || editModeReady || loadModeReady || loadAutoDetectMode;
  const modeCopy = mode === MODE.NEW ? MODE_COPY[MODE.NEW] : null;
  const extractionSummary = customFields.length > 0 || showTable
    ? `Se intentará extraer ${humanJoin([
      ...(customFields.length > 0 ? [`${customFields.length} campo${customFields.length === 1 ? '' : 's'} personalizado${customFields.length === 1 ? '' : 's'}`] : []),
      ...(showTable ? ['tabla principal'] : []),
    ])}.`
    : 'Todavía no hay nada seleccionado para extraer.';
  const isLoadedConfigDirty = mode === MODE.EDIT && loadedConfig != null && (
    JSON.stringify(customFields) !== JSON.stringify(loadedConfig.fields || []) ||
    showTable !== (loadedConfig.show_table ?? true) ||
    JSON.stringify(columnMetaOrder) !== JSON.stringify(loadedConfig.col_order || []) ||
    JSON.stringify(loadedConfigTriggers) !== JSON.stringify(loadedConfig.triggers || []) ||
    postPrompt !== (loadedConfig.post_prompt ?? '')
  );
  const uploadTitle = mode === MODE.EXTRACT
    ? 'Sube un documento para una prueba rápida'
    : mode === MODE.LOAD
      ? `Sube un documento para usar "${loadedConfig?.name ?? ''}"`
      : mode === MODE.EDIT
        ? `Sube un documento para probar "${loadedConfig?.name ?? ''}"`
        : 'Sube un documento para probar esta plantilla';
  const uploadDescription = mode === MODE.EXTRACT
    ? 'Activa una o ambas opciones y sube un archivo. No se guardará ninguna plantilla desde aquí.'
    : mode === MODE.LOAD
      ? 'Esta extracción usará exactamente la plantilla seleccionada, sin permitir cambios.'
      : 'Usaremos la configuración actual para comprobar si el resultado sale como esperas.';
  const uploadDetails = mode === MODE.EXTRACT
    ? []
    : [
      extractionSummary,
      'Se procesa un archivo por vez.',
      'Cada intento consume 1 crédito OCR si la extracción se envía correctamente.',
    ];

  // ── Mode selector screen ──────────────────────────────────────────────────────
  if (mode === null) {
    return (
      <div className="ocr-module">
        <section className="ocr-mode-intro">
          <span className="ocr-mode-intro__eyebrow">OCR personalizado</span>
          <h2 className="ocr-mode-intro__title">Extrae solo los datos que te importan</h2>
          <p className="ocr-mode-intro__desc">
            Puedes crear una plantilla reusable, editar una existente o hacer una extracción rápida para explorar un documento.
          </p>
          <div className="ocr-mode-intro__steps">
            <div className="ocr-mode-intro__step">
              <span className="ocr-mode-intro__step-number">1</span>
              <span>Elige el tipo de flujo que mejor se adapta a tu caso.</span>
            </div>
            <div className="ocr-mode-intro__step">
              <span className="ocr-mode-intro__step-number">2</span>
              <span>Define campos o usa una plantilla guardada.</span>
            </div>
            <div className="ocr-mode-intro__step">
              <span className="ocr-mode-intro__step-number">3</span>
              <span>Sube un documento, revisa el resultado y descárgalo.</span>
            </div>
          </div>
        </section>

        <div className="ocr-mode-selector">
          <div className="ocr-mode-selector__header">
            <p className="ocr-mode-selector__title">¿Cómo quieres empezar?</p>
            <p className="ocr-mode-selector__subtitle">
              Si es tu primera vez, lo más claro suele ser crear una plantilla nueva o usar la extracción rápida.
            </p>
          </div>
          <div className="ocr-mode-selector__cards">
            <button className="ocr-mode-card" onClick={() => selectMode(MODE.NEW)}>
              <span className="ocr-mode-card__badge">Recomendado si es tu primera vez</span>
              <span className="ocr-mode-card__icon">＋</span>
              <span className="ocr-mode-card__label">Crear plantilla nueva</span>
              <span className="ocr-mode-card__desc">Define los campos desde cero, pruébalos con un documento y luego guárdalos.</span>
            </button>
            <button
              className="ocr-mode-card"
              onClick={() => selectMode(MODE.EDIT)}
              disabled={savedConfigs.length === 0}
              title={savedConfigs.length === 0 ? 'No tienes configuraciones guardadas' : ''}
            >
              <span className="ocr-mode-card__badge">Para ajustes finos</span>
              <span className="ocr-mode-card__icon">✎</span>
              <span className="ocr-mode-card__label">Editar plantilla guardada</span>
              <span className="ocr-mode-card__desc">Cambia una plantilla que ya usas sin empezar de cero.</span>
            </button>
            <button
              className="ocr-mode-card"
              onClick={() => selectMode(MODE.LOAD)}
              disabled={savedConfigs.length === 0}
              title={savedConfigs.length === 0 ? 'No tienes configuraciones guardadas' : ''}
            >
              <span className="ocr-mode-card__badge">Más rápido si ya la tienes creada</span>
              <span className="ocr-mode-card__icon">▶</span>
              <span className="ocr-mode-card__label">Usar plantilla guardada</span>
              <span className="ocr-mode-card__desc">Aplica una plantilla existente directamente sobre un nuevo documento.</span>
            </button>
            <button className="ocr-mode-card" onClick={() => selectMode(MODE.EXTRACT)}>
              <span className="ocr-mode-card__badge">Para salir de dudas rápido</span>
              <span className="ocr-mode-card__icon">⚡</span>
              <span className="ocr-mode-card__label">Extracción rápida</span>
              <span className="ocr-mode-card__desc">Haz una prueba sin crear plantilla y ve qué logra detectar el sistema.</span>
            </button>
            <button className="ocr-mode-card" onClick={() => selectMode(MODE.API)}>
              <span className="ocr-mode-card__badge">Para integraciones externas</span>
              <span className="ocr-mode-card__icon">⇄</span>
              <span className="ocr-mode-card__label">Integración API</span>
              <span className="ocr-mode-card__desc">Conecta tu sistema con un POST request y recibe los datos como JSON automáticamente.</span>
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── API mode ──────────────────────────────────────────────────────────────────
  if (mode === MODE.API) {
    return (
      <OcrApiPanel
        savedConfigs={savedConfigs}
        session={session}
        userId={userId}
        onBack={handleBack}
      />
    );
  }

  // ── Main workspace ────────────────────────────────────────────────────────────
  return (
    <div className="ocr-module">

      {/* ── Top bar: back + mode label ──────────────────────────── */}
      {state === STATE.IDLE && (
        <div className="ocr-topbar">
          <button className="ocr-btn-ghost ocr-topbar__back" onClick={handleBack}>
            ← Volver
          </button>
          <span className="ocr-topbar__mode">
            {mode === MODE.NEW     && 'Plantilla nueva'}
            {mode === MODE.EDIT    && 'Editar plantilla'}
            {mode === MODE.LOAD    && 'Usar plantilla guardada'}
            {mode === MODE.EXTRACT && 'Extracción rápida'}
          </span>
        </div>
      )}

      {state === STATE.IDLE && modeCopy && (
        <section className="ocr-workflow-card">
          <div className="ocr-workflow-card__header">
            <span className="ocr-workflow-card__eyebrow">{modeCopy.eyebrow}</span>
            <h3 className="ocr-workflow-card__title">{modeCopy.title}</h3>
            <p className="ocr-workflow-card__desc">{modeCopy.description}</p>
          </div>
          <div className="ocr-workflow-card__steps">
            {modeCopy.steps.map((step, index) => (
              <div key={step} className="ocr-workflow-card__step">
                <span className="ocr-workflow-card__step-number">{index + 1}</span>
              <span>{step}</span>
            </div>
            ))}
          </div>
          <div className="ocr-workflow-card__summary">
            <span className="ocr-workflow-card__summary-label">Resumen actual</span>
            <p>{extractionSummary}</p>
          </div>
        </section>
      )}

      {/* ── Saved configs panel ─────────────────────────────────── */}
      {showConfigsPanel && <SavedConfigsPanel
        configs={savedConfigs}
        currentFields={customFields}
        currentShowTable={showTable}
        currentColOrder={columnMetaOrder}
        loadedConfig={loadedConfig}
        detectedConfigName={detectedConfigName}
        defaultOpen={mode === MODE.EDIT || mode === MODE.LOAD}
        allowExistingTemplateManagement={false}
        onLoad={handleLoadConfig}
        onSave={handleSaveConfig}
        onUpdate={handleUpdateConfig}
        onDelete={handleDeleteConfig}
        onUpdateTriggers={handleUpdateTriggers}
      />}

      {(mode === MODE.EDIT || mode === MODE.LOAD) && (
        <ConfigPickerPanel
          title={mode === MODE.EDIT ? 'Elige la plantilla que quieres editar' : 'Elige cómo quieres usar una plantilla'}
          description={
            mode === MODE.EDIT
              ? 'Al seleccionarla, se cargarán todos sus campos para que puedas agregar o quitar información antes de guardar.'
              : autoDetectEnabled
                ? 'La auto-detección está activa. Sube un documento y el sistema intentará encontrar la plantilla correcta por ti.'
                : 'Selecciona manualmente la plantilla que quieres usar en la extracción.'
          }
          configs={savedConfigs}
          selectedId={loadedConfig?.id ?? null}
          onSelect={handleLoadConfig}
          onBack={handleBack}
          emptyMessage="Todavía no tienes plantillas guardadas."
          headerActions={mode === MODE.LOAD ? (
            <div className="ocr-picker-mode-switcher">
              <span className="ocr-picker-mode-switcher__label">Modo de selección</span>
              <div className="ocr-picker-mode-toggle">
                <button
                  type="button"
                  className={`ocr-picker-mode-toggle__btn ${!autoDetectEnabled ? 'is-active' : ''}`}
                  onClick={() => setLoadSelectionMode('manual')}
                >
                  Elegir plantilla
                </button>
                <button
                  type="button"
                  className={`ocr-picker-mode-toggle__btn ${autoDetectEnabled ? 'is-active' : ''}`}
                  onClick={() => setLoadSelectionMode('auto')}
                >
                  Auto-detectar
                </button>
              </div>
            </div>
          ) : null}
          hideList={mode === MODE.LOAD && autoDetectEnabled}
          hiddenListMessage="La selección manual está desactivada mientras la auto-detección esté activa. Sube un documento para que el sistema intente identificar la plantilla correcta."
        />
      )}

      {/* ── Field config + preview ──────────────────────────────── */}
      {showFieldEditor && (
        <div className="ocr-config-row">
          <CustomFieldsPanel
            fields={customFields}
            onAdd={addField}
            onRemove={removeField}
            showTable={showTable}
            onToggleTable={() => setShowTable(v => !v)}
            readOnly={mode === MODE.LOAD}
          />
          <OcrStructurePreview
            activeMetaKeys={activeMetaKeys}
            columnMetaOrder={columnMetaOrder}
            showTable={showTable}
            onMoveToColumn={moveToColumn}
            onMoveToHeader={moveToHeader}
            onReorderColumns={reorderColumns}
            metaFields={customFields}
            readOnly={mode === MODE.LOAD}
          />
        </div>
      )}

      {/* ── Post-extraction prompt ──────────────────────────────── */}
      {(mode === MODE.NEW || editModeReady) && state === STATE.IDLE && (
        <section className="ocr-template-picker">
          <div className="ocr-template-picker__header">
            <div className="ocr-template-picker__header-main">
              <h3 className="ocr-template-picker__title">Ajuste post-extracción</h3>
              <p className="ocr-template-picker__desc">
                Instrucción que se aplica automáticamente al resultado cada vez que uses esta plantilla.
                Ideal para normalizar columnas, quitar filas vacías o formatear valores.
              </p>
            </div>
          </div>
          <textarea
            className="ocr-custom-input"
            style={{ width: '100%', minHeight: '5rem', resize: 'vertical', fontSize: '0.85rem', boxSizing: 'border-box' }}
            placeholder='Ej: "Pon los nombres de columna en minúscula" o "Quita filas donde la cantidad sea 0"'
            value={postPrompt}
            onChange={e => setPostPrompt(e.target.value)}
          />
          {postPrompt.trim() && (
            <p className="ocr-custom-hint ocr-custom-hint--compact" style={{ marginTop: '0.3rem' }}>
              Esta instrucción se enviará junto con cada extracción. No consume crédito adicional.
            </p>
          )}
        </section>
      )}

      {mode === MODE.EDIT && loadedConfig && state === STATE.IDLE && (
        <section className="ocr-template-picker">
          <AutoDetectRuleEditor
            mode={loadedConfigAutoDetectMode}
            fieldName={loadedConfigTriggerField}
            fieldValue={loadedConfigTriggerValue}
            onModeChange={(nextMode) => {
              setLoadedConfigAutoDetectMode(nextMode);

              if (nextMode === AUTO_DETECT_RULE_MODE.OFF) {
                setLoadedConfigTriggerField('');
                setLoadedConfigTriggerValue('');
                setLoadedConfigTriggers([]);
                return;
              }

              if (nextMode === AUTO_DETECT_RULE_MODE.VALUE_ONLY) {
                setLoadedConfigTriggerField('');
                setLoadedConfigTriggers(buildAutoDetectTriggers(nextMode, '', loadedConfigTriggerValue));
                return;
              }

              setLoadedConfigTriggers(buildAutoDetectTriggers(nextMode, loadedConfigTriggerField, loadedConfigTriggerValue));
            }}
            onFieldNameChange={(nextField) => {
              setLoadedConfigTriggerField(nextField);
              setLoadedConfigTriggers(buildAutoDetectTriggers(loadedConfigAutoDetectMode, nextField, loadedConfigTriggerValue));
            }}
            onFieldValueChange={(nextValue) => {
              setLoadedConfigTriggerValue(nextValue);
              setLoadedConfigTriggers(buildAutoDetectTriggers(loadedConfigAutoDetectMode, loadedConfigTriggerField, nextValue));
            }}
            title={`Habilitar auto-detección para "${loadedConfig.name}"`}
            description="Si configuras esta regla aquí, luego esta plantilla podrá encontrarse sola cuando uses el modo de auto-detección."
          />
        </section>
      )}

      {mode === MODE.EDIT && loadedConfig && isLoadedConfigDirty && state === STATE.IDLE && (
        <div className="ocr-edit-savebar">
          <div className="ocr-edit-savebar__content">
            <p className="ocr-edit-savebar__title">Hay cambios sin guardar en "{loadedConfig.name}"</p>
            <p className="ocr-edit-savebar__desc">
              Si guardas ahora, la plantilla se actualizará y volverás a la pantalla principal.
            </p>
            {!isAutoDetectRuleValid(loadedConfigAutoDetectMode, loadedConfigTriggerField, loadedConfigTriggerValue) && (
              <p className="ocr-edit-savebar__error">
                Para guardar la auto-detección debes completar todos los datos de la opción elegida.
              </p>
            )}
          </div>
          <button
            className="ocr-btn-primary ocr-edit-savebar__button"
            onClick={handleSaveLoadedConfig}
            disabled={savingLoadedConfig || !isAutoDetectRuleValid(loadedConfigAutoDetectMode, loadedConfigTriggerField, loadedConfigTriggerValue)}
          >
            {savingLoadedConfig ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {saveChangesError && <p className="ocr-edit-savebar__error">{saveChangesError}</p>}
        </div>
      )}

      {/* ── Load mode: prompt to pick config ────────────────────── */}
      {mode === MODE.LOAD && !loadedConfig && !autoDetectEnabled && state === STATE.IDLE && (
        <p className="ocr-custom-notice">
          Selecciona una plantilla de la lista para continuar.
        </p>
      )}

      {mode === MODE.LOAD && autoDetectEnabled && state === STATE.IDLE && (
        <p className="ocr-custom-notice">
          La auto-detección está activa. Sube un documento y el sistema intentará escoger la plantilla adecuada automáticamente.
        </p>
      )}

      {mode === MODE.EDIT && !loadedConfig && state === STATE.IDLE && (
        <p className="ocr-custom-notice">
          Elige primero la plantilla que quieres editar. Cuando la cargues, aquí aparecerán sus campos y la vista previa.
        </p>
      )}

      {/* ── Extract mode options ────────────────────────────────── */}
      {mode === MODE.EXTRACT && state === STATE.IDLE && (
        <div className="ocr-extract-options">
          <label className="ocr-extract-option">
            <input
              type="checkbox"
              checked={extractMeta}
              onChange={e => setExtractMeta(e.target.checked)}
            />
            <div className="ocr-extract-option__text">
              <span className="ocr-extract-option__label">Campos generales</span>
              <span className="ocr-extract-option__desc">Intenta detectar datos como folio, fecha, proveedor, RUT o montos.</span>
            </div>
          </label>
          <label className="ocr-extract-option">
            <input
              type="checkbox"
              checked={extractTable}
              onChange={e => setExtractTable(e.target.checked)}
            />
            <div className="ocr-extract-option__text">
              <span className="ocr-extract-option__label">Tabla principal</span>
              <span className="ocr-extract-option__desc">Extrae filas de productos o servicios con sus columnas principales.</span>
            </div>
          </label>
        </div>
      )}

      {/* ── States ─────────────────────────────────────────────── */}
      {showUpload && (state === STATE.IDLE || state === STATE.ERROR) && (
        <>
          <OcrUploadPanel
            onFileSelected={handleFileSelected}
            disabled={!canExtract}
            eyebrow="Documento a procesar"
            title={uploadTitle}
            description={uploadDescription}
            details={uploadDetails}
            note="El archivo se procesa a través de la API y no se guarda como documento persistente en la herramienta."
            actionLabel="Elegir archivo"
          />
          {!canExtract && (
            <p className="ocr-custom-notice">
              Agrega al menos un campo de encabezado o activa la tabla para poder extraer.
            </p>
          )}
          {state === STATE.ERROR && (
            <div className="ocr-error">
              <span><strong>Error:</strong> {error}</span>
              <button className="ocr-btn-ghost" onClick={handleReset}>Reintentar</button>
            </div>
          )}
        </>
      )}

      {state === STATE.DETECTING && (
        <div className="ocr-loading">
          <div className="ocr-spinner" />
          <p>Analizando documento…</p>
          <p className="ocr-loading-sub">Buscando configuración automática.</p>
        </div>
      )}

      {state === STATE.LOADING && (
        <div className="ocr-loading">
          <div className="ocr-spinner" />
          <p>Extrayendo de <strong>{file?.name}</strong>…</p>
          <p className="ocr-loading-sub">Consultando Gemini, puede tomar unos segundos.</p>
        </div>
      )}

      {state === STATE.DONE && result && (
        <>
          {mode === MODE.LOAD && autoDetectMatch?.matchedPairs?.length > 0 && (
            <section className="ocr-autodetect-summary">
              <div className="ocr-autodetect-summary__header">
                <span className="ocr-autodetect-summary__eyebrow">Resumen de auto-detección</span>
                <h3 className="ocr-autodetect-summary__title">
                  Plantilla aplicada: {autoDetectMatch.configName}
                </h3>
                <p className="ocr-autodetect-summary__desc">
                  El sistema comparó las reglas de la plantilla con el documento y encontró estas coincidencias antes de hacer la extracción.
                </p>
              </div>

              <div className="ocr-autodetect-summary__grid">
                <div className="ocr-autodetect-summary__column">
                  <span className="ocr-autodetect-summary__column-title">Campos requeridos</span>
                  <ul className="ocr-autodetect-summary__list">
                    {autoDetectMatch.matchedPairs.map((pair, index) => (
                      <li key={`${pair.field_name}-${index}`} className="ocr-autodetect-summary__item">
                        <span className="ocr-autodetect-summary__field">{pair.field_name}</span>
                        <span className="ocr-autodetect-summary__value">{pair.required_value}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="ocr-autodetect-summary__column">
                  <span className="ocr-autodetect-summary__column-title">Campos extraídos</span>
                  <ul className="ocr-autodetect-summary__list">
                    {autoDetectMatch.matchedPairs.map((pair, index) => (
                      <li key={`${pair.field_name}-found-${index}`} className="ocr-autodetect-summary__item">
                        <span className="ocr-autodetect-summary__field">{pair.field_name}</span>
                        <span className="ocr-autodetect-summary__value is-found">{pair.extracted_value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <OcrTableView
            headers={result.headers}
            rows={result.rows}
            meta={result.meta}
            showTable={showTable && result.rows.length > 0}
            activeMetaKeys={activeMetaKeys}
            columnMetaOrder={columnMetaOrder}
            filename={file?.name || 'extraccion'}
            onReset={handleReset}
            metaFields={customFields}
          />
        </>
      )}
    </div>
  );
}
