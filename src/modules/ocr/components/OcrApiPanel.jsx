import { useState, useEffect } from 'react';
import { listApiKeys, createApiKey, revokeApiKey } from '../../../services/apiKeys';

const API_MODE = {
  QUICK:  'quick',   // extracción rápida, sin plantilla
  MANUAL: 'manual',  // plantilla fija elegida por el usuario
  AUTO:   'auto',    // auto-detecta según triggers
};

const API_MODE_INFO = {
  [API_MODE.QUICK]: {
    label: 'Extracción rápida',
    desc: 'Sin plantilla. El sistema detecta campos generales y la tabla principal de cualquier documento.',
    badge: null,
    configIdHint: null,
  },
  [API_MODE.MANUAL]: {
    label: 'Plantilla fija',
    desc: 'Cada request usa siempre la misma plantilla. Ideal si todos tus documentos son del mismo tipo.',
    badge: 'Requiere plantilla guardada',
    configIdHint: 'Incluye el configId de la plantilla en cada request.',
  },
  [API_MODE.AUTO]: {
    label: 'Auto-detectar plantilla',
    desc: 'El sistema analiza el documento y elige la plantilla correcta según las reglas configuradas.',
    badge: 'Requiere plantillas con reglas de auto-detección',
    configIdHint: null,
  },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function fetchApiMode(session) {
  const r = await fetch('/api/user-settings', {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  if (!r.ok) return API_MODE.AUTO;
  const d = await r.json();
  return d.api_mode ?? API_MODE.AUTO;
}

async function saveApiMode(session, mode) {
  await fetch('/api/user-settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ api_mode: mode }),
  });
}

export default function OcrApiPanel({ savedConfigs, session, userId, onBack }) {
  const [apiMode, setApiMode]             = useState(API_MODE.AUTO);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [keys, setKeys]                   = useState([]);
  const [loadingKeys, setLoadingKeys]     = useState(true);
  const [newKeyName, setNewKeyName]       = useState('');
  const [creating, setCreating]           = useState(false);
  const [newKeyRaw, setNewKeyRaw]         = useState('');
  const [copied, setCopied]               = useState(false);
  const [keyError, setKeyError]           = useState('');

  const configsWithTriggers = savedConfigs.filter(c => c.triggers?.length > 0);
  const hasManualConfigs    = savedConfigs.length > 0;
  const hasAutoConfigs      = configsWithTriggers.length > 0;

  useEffect(() => {
    if (!userId) return;
    listApiKeys(userId)
      .then(setKeys)
      .catch(e => setKeyError(e.message))
      .finally(() => setLoadingKeys(false));
  }, [userId]);

  useEffect(() => {
    if (!session) return;
    fetchApiMode(session).then(setApiMode);
  }, [session]);

  const handleModeChange = (m) => {
    setApiMode(m);
    setSelectedConfig(null);
    saveApiMode(session, m);
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setKeyError('');
    setNewKeyRaw('');
    try {
      const created = await createApiKey(session, newKeyName.trim());
      setNewKeyRaw(created.raw_key);
      setKeys(prev => [created, ...prev]);
      setNewKeyName('');
    } catch (e) {
      setKeyError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId, keyName) => {
    if (!window.confirm(`¿Revocar la clave "${keyName}"? Esta acción no se puede deshacer.`)) return;
    try {
      await revokeApiKey(session, keyId);
      setKeys(prev => prev.filter(k => k.id !== keyId));
      if (newKeyRaw) setNewKeyRaw('');
    } catch (e) {
      setKeyError(e.message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(newKeyRaw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Example request based on current selection ────────────────────────────
  const modeField = apiMode === API_MODE.QUICK ? '\nmode=quick'
    : apiMode === API_MODE.AUTO ? ''  // auto is default, no need to send
    : '';
  const configIdLine = apiMode === API_MODE.MANUAL && selectedConfig
    ? `\nconfigId=${selectedConfig.id}`
    : modeField;

  const jsonModeField = apiMode === API_MODE.QUICK ? ',\n  "mode": "quick"' : '';
  const jsonExample = apiMode === API_MODE.MANUAL && selectedConfig
    ? `{\n  "fileData": "<base64>",\n  "mimeType": "image/jpeg",\n  "configId": "${selectedConfig.id}"\n}`
    : `{\n  "fileData": "<base64>",\n  "mimeType": "image/jpeg"${jsonModeField}\n}`;

  const warningOk =
    (apiMode === API_MODE.QUICK) ||
    (apiMode === API_MODE.MANUAL && selectedConfig) ||
    (apiMode === API_MODE.AUTO   && hasAutoConfigs);

  return (
    <div className="ocr-module">

      {/* ── Back ─────────────────────────────────────────────────── */}
      <div className="ocr-topbar">
        <button className="ocr-btn-ghost ocr-topbar__back" onClick={onBack}>← Volver</button>
        <span className="ocr-topbar__mode">Integración API</span>
      </div>

      {/* ── Intro ────────────────────────────────────────────────── */}
      <section className="ocr-mode-intro" style={{ paddingBottom: '0.5rem' }}>
        <span className="ocr-mode-intro__eyebrow">API externa</span>
        <h2 className="ocr-mode-intro__title" style={{ fontSize: '1.15rem' }}>
          Conecta tu sistema con un POST request
        </h2>
        <p className="ocr-mode-intro__desc">
          Cualquier sistema externo puede enviar un documento y recibir los datos extraídos como JSON.
          El comportamiento depende del modo de extracción que elijas aquí.
        </p>
      </section>

      {/* ── Warning ──────────────────────────────────────────────── */}
      <section className="ocr-template-picker" style={{
        borderColor: warningOk ? 'var(--border)' : '#e67e22',
        background: warningOk ? undefined : 'color-mix(in srgb, #e67e22 6%, var(--panel))',
      }}>
        <div className="ocr-template-picker__header">
          <div className="ocr-template-picker__header-main">
            <h3 className="ocr-template-picker__title">
              {warningOk ? 'Configuración lista' : 'Verifica la configuración antes de integrar'}
            </h3>
          </div>
        </div>
        <p className="ocr-template-picker__desc" style={{ margin: 0 }}>
          La extracción y el resultado JSON dependen directamente de lo que configures aquí.
          Asegúrate de que exista la configuración adecuada para los documentos que vas a procesar:
        </p>
        <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <li className="ocr-custom-hint" style={{ margin: 0 }}>
            <strong>Extracción rápida</strong> — no requiere plantilla. Detecta campos generales y tabla.
          </li>
          <li className="ocr-custom-hint" style={{ margin: 0 }}>
            <strong>Plantilla fija</strong> — requiere al menos una plantilla guardada y que la selecciones aquí.
          </li>
          <li className="ocr-custom-hint" style={{ margin: 0 }}>
            <strong>Auto-detectar</strong> — requiere plantillas con reglas de auto-detección configuradas.
            {!hasAutoConfigs && (
              <span style={{ color: '#e67e22', marginLeft: '0.4rem' }}>
                No tienes plantillas con reglas de auto-detección aún.
              </span>
            )}
          </li>
        </ul>
      </section>

      {/* ── Extraction mode selector ──────────────────────────────── */}
      <section className="ocr-template-picker">
        <div className="ocr-template-picker__header">
          <div className="ocr-template-picker__header-main">
            <h3 className="ocr-template-picker__title">Modo de extracción</h3>
            <p className="ocr-template-picker__desc">
              Define cómo se comportará la API al recibir un documento.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {Object.values(API_MODE).map((m) => {
            const info = API_MODE_INFO[m];
            const disabled = (m === API_MODE.MANUAL && !hasManualConfigs) ||
                             (m === API_MODE.AUTO   && !hasAutoConfigs);
            const isActive = apiMode === m;
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => handleModeChange(m)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: '0.2rem', padding: '0.7rem 0.9rem', textAlign: 'left',
                  border: `1.5px solid ${isActive ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
                  background: isActive ? 'color-mix(in srgb, var(--brand) 8%, var(--panel))' : 'var(--color-bg-subtle)',
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isActive ? 'var(--brand)' : 'var(--ink-soft)'}`,
                    background: isActive ? 'var(--brand)' : 'transparent',
                  }} />
                  <span style={{ fontSize: '0.87rem', fontWeight: 600, color: 'var(--ink)' }}>
                    {info.label}
                  </span>
                  {info.badge && (
                    <span style={{
                      fontSize: '0.68rem', padding: '0.1rem 0.45rem',
                      borderRadius: 99, background: 'var(--border)', color: 'var(--ink-soft)',
                    }}>
                      {info.badge}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', paddingLeft: '1.4rem' }}>
                  {info.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Config picker for manual mode */}
        {apiMode === API_MODE.MANUAL && savedConfigs.length > 0 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span className="ocr-option-group__label">Selecciona la plantilla que usará la API</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {savedConfigs.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedConfig(c)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.5rem 0.75rem', textAlign: 'left',
                    border: `1.5px solid ${selectedConfig?.id === c.id ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: 6, cursor: 'pointer',
                    background: selectedConfig?.id === c.id
                      ? 'color-mix(in srgb, var(--brand) 8%, var(--panel))'
                      : 'var(--color-bg-subtle)',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)' }}>{c.name}</span>
                  <span style={{ fontSize: '0.73rem', color: 'var(--ink-soft)' }}>
                    {c.fields?.length ?? 0} campo{(c.fields?.length ?? 0) !== 1 ? 's' : ''}
                    {c.show_table ? ' + tabla' : ''}
                  </span>
                </button>
              ))}
            </div>
            {!selectedConfig && (
              <p className="ocr-custom-hint" style={{ margin: 0, color: '#e67e22' }}>
                Selecciona una plantilla para ver el ejemplo de request.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── How to integrate ──────────────────────────────────────── */}
      {(apiMode !== API_MODE.MANUAL || selectedConfig) && (
        <section className="ocr-template-picker">
          <div className="ocr-template-picker__header">
            <div className="ocr-template-picker__header-main">
              <h3 className="ocr-template-picker__title">Cómo hacer el POST</h3>
              <p className="ocr-template-picker__desc">
                Hay dos formas de enviar el documento. Elige según tu herramienta o lenguaje.
              </p>
            </div>
          </div>

          {/* Method A */}
          <div style={{
            border: '1.5px solid var(--border)', borderRadius: 8,
            overflow: 'hidden', marginBottom: '0.85rem',
          }}>
            <div style={{
              padding: '0.55rem 0.9rem',
              background: 'color-mix(in srgb, var(--brand) 7%, var(--panel))',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{
                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                color: 'var(--brand)', textTransform: 'uppercase',
              }}>Opción A</span>
              <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--ink)' }}>
                Multipart — archivo directo
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: '0.68rem', padding: '0.1rem 0.45rem',
                borderRadius: 99, background: 'var(--border)', color: 'var(--ink-soft)',
              }}>
                Recomendado para Postman, Make, Zapier
              </span>
            </div>
            <div style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p className="ocr-custom-hint" style={{ margin: 0 }}>
                El archivo viaja como adjunto (igual que subir un archivo en un formulario web).
                No necesitas codificarlo — solo referenciarlo directamente.
              </p>
              <ol style={{ margin: '0.2rem 0 0', paddingLeft: '1.3rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <li className="ocr-custom-hint" style={{ margin: 0 }}>
                  Agrega el header <code style={{ fontSize: '0.76rem' }}>Authorization: Bearer sk_live_...</code> con tu clave.
                </li>
                <li className="ocr-custom-hint" style={{ margin: 0 }}>
                  Envía el archivo como campo <code style={{ fontSize: '0.76rem' }}>file</code> en un form-data.
                </li>
                {apiMode === API_MODE.MANUAL && selectedConfig && (
                  <li className="ocr-custom-hint" style={{ margin: 0 }}>
                    Incluye el campo <code style={{ fontSize: '0.76rem' }}>configId</code> con el valor de la plantilla.
                  </li>
                )}
                <li className="ocr-custom-hint" style={{ margin: 0 }}>
                  Recibe el JSON con los datos extraídos en la respuesta.
                </li>
              </ol>
              <pre style={{
                background: 'var(--color-bg-subtle)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '0.65rem 0.9rem', fontSize: '0.77rem',
                overflowX: 'auto', margin: '0.2rem 0 0', lineHeight: 1.7,
              }}>{`POST /api/extract
Authorization: Bearer sk_live_...
Content-Type: multipart/form-data

file=<PDF o imagen>${configIdLine}`}</pre>
            </div>
          </div>

          {/* Method B */}
          <div style={{
            border: '1.5px solid var(--border)', borderRadius: 8,
            overflow: 'hidden', marginBottom: '0.85rem',
          }}>
            <div style={{
              padding: '0.55rem 0.9rem',
              background: 'color-mix(in srgb, var(--ink-soft) 5%, var(--panel))',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{
                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                color: 'var(--ink-soft)', textTransform: 'uppercase',
              }}>Opción B</span>
              <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--ink)' }}>
                JSON + Base64 — archivo codificado
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: '0.68rem', padding: '0.1rem 0.45rem',
                borderRadius: 99, background: 'var(--border)', color: 'var(--ink-soft)',
              }}>
                Para código propio (Python, Node, etc.)
              </span>
            </div>
            <div style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p className="ocr-custom-hint" style={{ margin: 0 }}>
                El archivo se convierte a texto Base64 y se incluye dentro del JSON.
                Útil cuando el archivo viene de una variable o de otra API, no del disco.
              </p>
              <ol style={{ margin: '0.2rem 0 0', paddingLeft: '1.3rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <li className="ocr-custom-hint" style={{ margin: 0 }}>
                  Convierte el archivo a Base64 (Python: <code style={{ fontSize: '0.76rem' }}>base64.b64encode(data)</code>, JS: <code style={{ fontSize: '0.76rem' }}>Buffer.from(data).toString('base64')</code>).
                </li>
                <li className="ocr-custom-hint" style={{ margin: 0 }}>
                  Agrega el header <code style={{ fontSize: '0.76rem' }}>Authorization: Bearer sk_live_...</code>.
                </li>
                <li className="ocr-custom-hint" style={{ margin: 0 }}>
                  Envía un JSON con <code style={{ fontSize: '0.76rem' }}>fileData</code> (la cadena Base64) y <code style={{ fontSize: '0.76rem' }}>mimeType</code>.
                </li>
                <li className="ocr-custom-hint" style={{ margin: 0 }}>
                  Recibe el JSON con los datos extraídos en la respuesta.
                </li>
              </ol>
              <pre style={{
                background: 'var(--color-bg-subtle)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '0.65rem 0.9rem', fontSize: '0.77rem',
                overflowX: 'auto', margin: '0.2rem 0 0', lineHeight: 1.7,
              }}>{`POST /api/extract
Authorization: Bearer sk_live_...
Content-Type: application/json

${jsonExample}`}</pre>
            </div>
          </div>

          {/* Difference callout */}
          <div style={{
            padding: '0.6rem 0.9rem', borderRadius: 6,
            background: 'color-mix(in srgb, var(--ink-soft) 5%, var(--panel))',
            border: '1px solid var(--border)',
            marginBottom: '0.75rem',
          }}>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--ink)' }}>¿Cuál elegir?</strong>{' '}
              Usa <strong>Opción A</strong> si trabajas con Postman, Make o Zapier — es más simple y directa.
              Usa <strong>Opción B</strong> si tu código ya tiene el archivo en memoria o lo obtiene desde otra API y quieres evitar escribirlo a disco.
            </p>
          </div>

          {/* Response shape */}
          <div style={{
            padding: '0.6rem 0.9rem', borderRadius: 6,
            background: 'var(--color-bg-subtle)', border: '1px solid var(--border)',
          }}>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink)' }}>
              Respuesta (JSON):
            </p>
            <pre style={{
              margin: 0, fontSize: '0.76rem', lineHeight: 1.65,
              background: 'transparent', border: 'none', padding: 0,
            }}>{`{
  "headers": ["CÓDIGO", "DESCRIPCIÓN", "CANT", "PRECIO"],  // columnas de la tabla
  "rows":    [["001", "Producto A", 2, 1500], ...],         // filas
  "meta":    { "RUT": "76.807.250-7", "Total": "$154.062" } // campos fuera de la tabla
}`}</pre>
          </div>
        </section>
      )}

      {/* ── API Keys ──────────────────────────────────────────────── */}
      <section className="ocr-template-picker">
        <div className="ocr-template-picker__header">
          <div className="ocr-template-picker__header-main">
            <h3 className="ocr-template-picker__title">Claves API</h3>
            <p className="ocr-template-picker__desc">
              La clave es la contraseña que identifica quién hace el request. Sin ella, la API rechaza el intento.
              Crea una clave por cada integración o sistema externo para poder revocarla de forma independiente.
            </p>
          </div>
        </div>

        {/* Explain what happens on create — shown when no key has been revealed yet */}
        {!newKeyRaw && (
          <div style={{
            padding: '0.6rem 0.9rem', borderRadius: 6, marginBottom: '0.75rem',
            background: 'color-mix(in srgb, var(--ink-soft) 5%, var(--panel))',
            border: '1px solid var(--border)',
          }}>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--ink)' }}>Al crear una clave:</strong>{' '}
              el sistema genera una cadena única del tipo <code style={{ fontSize: '0.76rem' }}>sk_live_...</code> y
              te la muestra <strong>una sola vez</strong>. Cópiala de inmediato y guárdala en tu sistema
              (variable de entorno, gestor de secretos, etc.). Nosotros solo guardamos un
              hash — si la pierdes, deberás revocarla y crear una nueva.
            </p>
          </div>
        )}

        {/* New key revealed */}
        {newKeyRaw && (
          <div style={{
            marginBottom: '0.75rem', padding: '0.75rem',
            border: '1.5px solid var(--brand)', borderRadius: 6,
            background: 'color-mix(in srgb, var(--brand) 6%, var(--panel))',
          }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.83rem', fontWeight: 700, color: 'var(--ink)' }}>
              Copia esta clave ahora
            </p>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.77rem', color: 'var(--ink-soft)' }}>
              No se volverá a mostrar. Guárdala como variable de entorno o en tu gestor de contraseñas.
              Si la pierdes, revócala y crea una nueva.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <code style={{
                flex: 1, background: 'var(--color-bg-subtle)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '0.4rem 0.6rem', fontSize: '0.78rem', wordBreak: 'break-all',
              }}>
                {newKeyRaw}
              </code>
              <button className="ocr-btn-primary" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }} onClick={handleCopy}>
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        {/* Create */}
        <p className="ocr-custom-hint" style={{ margin: '0 0 0.4rem' }}>
          Dale un nombre descriptivo para recordar qué sistema la usa:
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <input
            className="ocr-custom-input"
            style={{ flex: 1 }}
            placeholder='Ej: "ERP producción" o "Pruebas locales"'
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !creating && handleCreateKey()}
            disabled={creating}
          />
          <button
            className="ocr-btn-primary"
            onClick={handleCreateKey}
            disabled={!newKeyName.trim() || creating}
            style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}
          >
            {creating ? 'Creando…' : 'Crear clave'}
          </button>
        </div>

        {keyError && (
          <p className="ocr-result-editor__error" style={{ marginBottom: '0.5rem' }}>{keyError}</p>
        )}

        {/* List */}
        {loadingKeys ? (
          <p className="ocr-template-picker__empty">Cargando claves…</p>
        ) : keys.length === 0 ? (
          <p className="ocr-template-picker__empty">No tienes claves creadas todavía.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {keys.map(k => (
              <div key={k.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.5rem 0.75rem', border: '1px solid var(--border)',
                borderRadius: 6, background: 'var(--color-bg-subtle)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 500, color: 'var(--ink)' }}>{k.name}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ink-soft)' }}>
                    <code style={{ fontSize: '0.72rem' }}>{k.key_prefix}…</code>
                    {' · '}Creada {fmtDate(k.created_at)}
                    {k.last_used_at ? ` · Último uso ${fmtDate(k.last_used_at)}` : ' · Nunca usada'}
                  </p>
                </div>
                <button
                  className="ocr-btn-ghost"
                  style={{ color: 'var(--color-danger, #c0392b)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}
                  onClick={() => handleRevoke(k.id, k.name)}
                >
                  Revocar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
