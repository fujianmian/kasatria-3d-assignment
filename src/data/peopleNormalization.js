const REQUIRED_COLUMNS = ['Name', 'Photo', 'Age', 'Country', 'Interest', 'Net Worth'];

export function normalizeText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseNumber(value, fieldName, recordNumber) {
  const numericValue = Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Record ${recordNumber}: ${fieldName} must be a valid number.`);
  }
  return numericValue;
}

function validateColumns(fields) {
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.includes(column));
  if (missing.length > 0) {
    throw new Error(`People data is missing required column(s): ${missing.join(', ')}.`);
  }
}

function normalizeRecord(row, index) {
  const recordNumber = index + 1;
  const values = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeText(value)]),
  );
  const missing = REQUIRED_COLUMNS.filter((column) => !values[column]);
  if (missing.length > 0) {
    throw new Error(`Record ${recordNumber}: missing required value(s): ${missing.join(', ')}.`);
  }

  return {
    id: recordNumber,
    name: values.Name,
    photo: values.Photo,
    age: parseNumber(values.Age, 'Age', recordNumber),
    country: values.Country,
    interest: values.Interest,
    netWorth: parseNumber(values['Net Worth'], 'Net Worth', recordNumber),
  };
}

export function normalizePeopleValues(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('People data is empty.');
  }

  const nonEmptyRows = values.filter((row) => Array.isArray(row) && row.some((value) => normalizeText(value)));
  if (nonEmptyRows.length === 0) {
    throw new Error('People data is empty.');
  }

  const headers = nonEmptyRows[0].map(normalizeText);
  validateColumns(headers);

  return nonEmptyRows.slice(1).map((row, index) => {
    const record = Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex]]));
    return normalizeRecord(record, index);
  });
}
