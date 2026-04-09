export default function AggregatesPanel({ aggregates, showAggregates, onToggle }) {
  if (!showAggregates) {
    return null;
  }

  return (
    <div className="aggregates-panel">
      <div className="aggregates-header">
        <h3>Totals</h3>
        <button
          className="toggle-btn"
          onClick={onToggle}
          title="Hide"
        >
          −
        </button>
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
