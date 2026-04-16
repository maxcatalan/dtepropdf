function hasVisibleValue(value) {
  return String(value ?? '').trim() !== '';
}

export function sanitizeTableRows(headers = [], rows = []) {
  return (rows || [])
    .map((row) => headers.map((_, index) => row?.[index] ?? ''))
    .filter((row) => row.some(hasVisibleValue));
}

export function buildFinalTable(headers, rows, meta, activeMetaKeys, columnMetaOrder, metaFields) {
  const sanitizedRows = sanitizeTableRows(headers, rows);
  const colMeta = columnMetaOrder
    .map((key) => metaFields.find((field) => field.key === key))
    .filter((field) => field && activeMetaKeys.has(field.key));

  const finalHeaders = [...headers, ...colMeta.map((field) => field.label)];
  const finalRows = sanitizedRows.map((row) => [
    ...row,
    ...colMeta.map((field) => meta?.[field.key] || ''),
  ]);

  return { finalHeaders, finalRows };
}

export function buildHeaderMetaFields(meta = {}, activeMetaKeys, columnMetaOrder, metaFields) {
  const columnSet = new Set(columnMetaOrder);
  const configuredKeys = new Set(metaFields.map((field) => field.key));

  const configuredMetaFields = metaFields
    .filter((field) => activeMetaKeys.has(field.key) && !columnSet.has(field.key) && hasVisibleValue(meta[field.key]))
    .map((field) => ({ key: field.key, label: field.label, value: meta[field.key] }));

  const genericMetaFields = Object.keys(meta)
    .filter((key) => !configuredKeys.has(key) && !columnSet.has(key) && hasVisibleValue(meta[key]))
    .map((key) => ({ key, label: key, value: meta[key] }));

  return [...configuredMetaFields, ...genericMetaFields];
}

export function buildExportMatrix(headerMetaFields, finalHeaders, finalRows, showTable) {
  const matrix = [];

  if (headerMetaFields.length > 0) {
    matrix.push(['Campo', 'Valor']);
    headerMetaFields.forEach(({ label, value }) => {
      matrix.push([label, value]);
    });
  }

  if (showTable && finalHeaders.length > 0) {
    if (matrix.length > 0) matrix.push([]);
    matrix.push(finalHeaders);
    finalRows.forEach((row) => {
      matrix.push(finalHeaders.map((_, index) => row[index] ?? ''));
    });
  }

  return matrix;
}

export function matrixToCSV(matrix) {
  const escape = (value) => {
    const text = String(value ?? '');
    return text.includes(',') || text.includes('"') || text.includes('\n')
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  return matrix.map((row) => row.map(escape).join(',')).join('\r\n');
}
