import Papa from 'papaparse';
import { normalizePeopleValues } from '../src/data/peopleNormalization.js';

export function parsePeopleCsv(bytes) {
  const csvText = new TextDecoder('windows-1252').decode(bytes);
  const result = Papa.parse(csvText, { header: false, skipEmptyLines: 'greedy' });
  if (result.errors.length > 0) {
    const [firstError] = result.errors;
    throw new Error(`Unable to parse people CSV: ${firstError.message} (row ${firstError.row ?? 'unknown'}).`);
  }
  return normalizePeopleValues(result.data);
}
