import { normalizePeopleValues } from '../data/peopleNormalization.js';

const SHEETS_API_ROOT = 'https://sheets.googleapis.com/v4/spreadsheets';

export function createSheetsValuesUrl(spreadsheetId, range) {
  if (!spreadsheetId) throw new Error('Google Spreadsheet ID is missing.');
  if (!range) throw new Error('Google Sheet range is missing.');

  const encodedSpreadsheetId = encodeURIComponent(spreadsheetId);
  const encodedRange = encodeURIComponent(range);
  return `${SHEETS_API_ROOT}/${encodedSpreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`;
}

function getSheetsErrorMessage(status, errorPayload) {
  const googleMessage = errorPayload?.error?.message ?? '';
  const googleStatus = errorPayload?.error?.status ?? '';
  if (/insufficient authentication scopes|insufficient permission/i.test(googleMessage)) {
    return 'Google Sheets read access was not granted. Please reconnect and approve the requested permission.';
  }
  if (/has not been used|is disabled/i.test(googleMessage)) {
    return 'Google Sheets API is not enabled for this Google Cloud project.';
  }
  const messages = {
    401: 'Your Google session has expired. Please reconnect.',
    403: 'Your Google account does not have permission to view this spreadsheet.',
    404: 'The configured spreadsheet or range could not be found.',
    429: 'Google Sheets is receiving too many requests. Please try again shortly.',
  };
  return messages[status] ?? (googleMessage || `Google Sheets request failed (${googleStatus || `HTTP ${status}`}).`);
}

function createSheetsError(status, errorPayload) {
  const error = new Error(getSheetsErrorMessage(status, errorPayload));
  error.code = status === 401 ? 'UNAUTHORIZED' : 'SHEETS_REQUEST_FAILED';
  return error;
}

export async function loadPeopleFromGoogleSheets({
  accessToken,
  spreadsheetId,
  range,
  fetchImplementation = fetch,
}) {
  if (!accessToken) throw new Error('Google authorization is required before loading people data.');

  const url = createSheetsValuesUrl(spreadsheetId, range);
  let response;
  try {
    response = await fetchImplementation(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    const networkError = new Error(`Unable to reach Google Sheets. Check your connection and try again. (${error.message})`);
    networkError.code = 'NETWORK_ERROR';
    throw networkError;
  }

  if (!response.ok) {
    const errorPayload = typeof response.json === 'function'
      ? await response.json().catch(() => null)
      : null;
    throw createSheetsError(response.status, errorPayload);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Google Sheets returned an unreadable response.');
  }

  return normalizePeopleValues(payload.values);
}
