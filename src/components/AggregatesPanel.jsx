export default function AggregatesPanel({ aggregates }) {
  return (
    <div className="aggregates-panel">
      <div className="aggregates-header">
        <h3>Totals across {Object.keys(aggregates).length > 0 ? 'all invoices' : '—'}</h3>
      </div>
      <div className="aggregates-grid">
        {Object.entries(aggregates).map(([key, value]) => {
          const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();

          return (
            <div key={key} className="aggregate-card">
              <span className="agg-label">{label}</span>
              <span className="agg-value">${value.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
