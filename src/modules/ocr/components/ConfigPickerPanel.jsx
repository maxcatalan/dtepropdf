export default function ConfigPickerPanel({
  title,
  description,
  configs,
  selectedId,
  onSelect,
  emptyMessage,
  headerActions = null,
  hideList = false,
  hiddenListMessage = '',
  onBack = null,
  backLabel = '← Volver al menú principal',
}) {
  if (configs.length === 0) {
    return (
      <section className="ocr-template-picker">
        <div className="ocr-template-picker__header">
          <div className="ocr-template-picker__header-main">
            {onBack && (
              <button type="button" className="ocr-btn-ghost ocr-template-picker__back" onClick={onBack}>
                {backLabel}
              </button>
            )}
            <h3 className="ocr-template-picker__title">{title}</h3>
            {description && <p className="ocr-template-picker__desc">{description}</p>}
          </div>
          {headerActions && <div className="ocr-template-picker__actions">{headerActions}</div>}
        </div>
        <p className="ocr-template-picker__empty">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="ocr-template-picker">
      <div className="ocr-template-picker__header">
        <div className="ocr-template-picker__header-main">
          {onBack && (
            <button type="button" className="ocr-btn-ghost ocr-template-picker__back" onClick={onBack}>
              {backLabel}
            </button>
          )}
          <h3 className="ocr-template-picker__title">{title}</h3>
          {description && <p className="ocr-template-picker__desc">{description}</p>}
        </div>
        {headerActions && <div className="ocr-template-picker__actions">{headerActions}</div>}
      </div>

      {hideList ? (
        <p className="ocr-template-picker__empty">{hiddenListMessage}</p>
      ) : (
        <div className="ocr-template-picker__list">
          {configs.map((config) => {
            const fieldCount = config.fields?.length ?? 0;
            const ruleCount = config.triggers?.length ?? 0;
            const isSelected = config.id === selectedId;

            return (
              <button
                key={config.id}
                type="button"
                className={`ocr-template-picker__item ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onSelect(config)}
              >
                <span className="ocr-template-picker__name">{config.name}</span>
                <span className="ocr-template-picker__meta">
                  {fieldCount} campo{fieldCount === 1 ? '' : 's'}
                  {config.show_table ? ' + tabla' : ' · sin tabla'}
                  {ruleCount > 0 ? ` · ${ruleCount} regla${ruleCount === 1 ? '' : 's'} automática${ruleCount === 1 ? '' : 's'}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
