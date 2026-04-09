const LABEL_MAP = {
  montoNeto:   'Monto Neto',
  montoExento: 'Monto Exento',
  iva:         'IVA',
  ivaTerc:     'IVA Terceros',
  montoTotal:  'Monto Total',
};

function formatLabel(key) {
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  // imptoReten keys come pre-formatted like "imptoReten (Tipo 27 | Tasa 10%)"
  return key.replace('imptoReten', 'Impuesto Retenido');
}

export default function AggregatesPanel({ aggregates }) {
  // Monto Total always goes last
  const ORDER = ['montoNeto', 'montoExento', 'iva', 'ivaTerc'];
  const sorted = [
    ...ORDER.filter(k => k in aggregates).map(k => [k, aggregates[k]]),
    ...Object.entries(aggregates).filter(([k]) => k.startsWith('imptoReten')),
    ...Object.entries(aggregates).filter(([k]) => k === 'montoTotal'),
  ];
  const entries = sorted;

  return (
    <div className="aggregates-panel">
      <div className="aggregates-header">
        <h3>Totales consolidados</h3>
      </div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th style={{ textAlign: 'right' }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className={key === 'montoTotal' ? 'highlight' : ''}>
                <td>{formatLabel(key)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>${value.toLocaleString('es-CL')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
