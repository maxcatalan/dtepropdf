import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { listApiKeys, createApiKey, revokeApiKey } from '../services/apiKeys';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ApiKeysPage() {
  const { session, user } = useAuth();
  const userId = user?.id;

  const [keys, setKeys]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [newKeyRaw, setNewKeyRaw] = useState('');
  const [copied, setCopied]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!userId) return;
    listApiKeys(userId)
      .then(setKeys)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    setNewKeyRaw('');
    try {
      const created = await createApiKey(session, newName.trim());
      setNewKeyRaw(created.raw_key);
      setKeys(prev => [created, ...prev]);
      setNewName('');
    } catch (e) {
      setError(e.message);
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
      setError(e.message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(newKeyRaw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ocr-module">

      {/* ── Intro ────────────────────────────────────────────────── */}
      <section className="ocr-mode-intro">
        <span className="ocr-mode-intro__eyebrow">API</span>
        <h2 className="ocr-mode-intro__title">Integra la extracción en tu sistema</h2>
        <p className="ocr-mode-intro__desc">
          Envía un documento vía POST y recibe los datos estructurados como JSON.
          Usa una clave para autenticar cada solicitud.
        </p>
      </section>

      {/* ── How to use ───────────────────────────────────────────── */}
      <section className="ocr-template-picker">
        <div className="ocr-template-picker__header">
          <div className="ocr-template-picker__header-main">
            <h3 className="ocr-template-picker__title">Cómo funciona</h3>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p className="ocr-template-picker__desc" style={{ margin: 0 }}>
            Endpoint: <code style={{ background: 'var(--color-bg-subtle)', padding: '0.1rem 0.4rem', borderRadius: 4, fontSize: '0.82rem' }}>POST /api/extract</code>
          </p>
          <pre style={{
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '0.8rem 1rem',
            fontSize: '0.78rem',
            overflowX: 'auto',
            margin: 0,
            lineHeight: 1.6,
          }}>{`Authorization: Bearer sk_live_...

{
  "fileData": "<base64>",
  "mimeType": "image/jpeg",
  "filename": "factura.jpg",   // opcional
  "configId": "<uuid>"         // opcional — si no se envía, auto-detecta
}

// Respuesta:
{
  "headers": ["Código", "Descripción", "Cantidad", "Precio"],
  "rows": [["001", "Tornillo M6", "100", "$0.05"]],
  "meta": { "folio": "F-001", "total": "$5.00" }
}`}</pre>
          <p className="ocr-custom-hint" style={{ margin: 0 }}>
            El <code>configId</code> es el ID de una plantilla guardada en OCR personalizado.
            Si no lo mandas, el sistema intenta auto-detectar la plantilla correcta o hace una extracción genérica.
          </p>
        </div>
      </section>

      {/* ── New revealed key banner ───────────────────────────────── */}
      {newKeyRaw && (
        <section className="ocr-template-picker" style={{ borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 6%, var(--panel))' }}>
          <div className="ocr-template-picker__header">
            <div className="ocr-template-picker__header-main">
              <h3 className="ocr-template-picker__title">Clave creada — cópiala ahora</h3>
              <p className="ocr-template-picker__desc">
                Esta es la única vez que verás la clave completa. Guárdala en un lugar seguro.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <code style={{
              flex: 1,
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '0.5rem 0.75rem',
              fontSize: '0.82rem',
              wordBreak: 'break-all',
            }}>
              {newKeyRaw}
            </code>
            <button className="ocr-btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={handleCopy}>
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </section>
      )}

      {/* ── Create key ───────────────────────────────────────────── */}
      <section className="ocr-template-picker">
        <div className="ocr-template-picker__header">
          <div className="ocr-template-picker__header-main">
            <h3 className="ocr-template-picker__title">Nueva clave API</h3>
            <p className="ocr-template-picker__desc">
              Dale un nombre que te ayude a identificar desde dónde se usa.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className="ocr-custom-input"
            style={{ flex: 1 }}
            placeholder='Ej: "ERP producción" o "Pruebas locales"'
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
            disabled={creating}
          />
          <button
            className="ocr-btn-primary"
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            style={{ whiteSpace: 'nowrap' }}
          >
            {creating ? 'Creando…' : 'Crear clave'}
          </button>
        </div>
        {error && <p className="ocr-result-editor__error" style={{ marginTop: '0.4rem' }}>{error}</p>}
      </section>

      {/* ── Key list ─────────────────────────────────────────────── */}
      <section className="ocr-template-picker">
        <div className="ocr-template-picker__header">
          <div className="ocr-template-picker__header-main">
            <h3 className="ocr-template-picker__title">Claves activas</h3>
          </div>
        </div>
        {loading ? (
          <p className="ocr-template-picker__empty">Cargando…</p>
        ) : keys.length === 0 ? (
          <p className="ocr-template-picker__empty">No tienes claves creadas todavía.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {keys.map(k => (
              <div key={k.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.55rem 0.75rem',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--color-bg-subtle)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)' }}>{k.name}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                    <code>{k.key_prefix}…</code>
                    {' · '}Creada {fmtDate(k.created_at)}
                    {k.last_used_at ? ` · Último uso ${fmtDate(k.last_used_at)}` : ' · Nunca usada'}
                  </p>
                </div>
                <button
                  className="ocr-btn-ghost"
                  style={{ color: 'var(--color-danger, #c0392b)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}
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
