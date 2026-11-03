export const APPLICATION_SESSION_DURATION_MS = 30 * 60 * 1000;
export const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;
export const SESSION_STORAGE_KEY = 'kasatria.people-session.v1';

export function createPersistedSession(tokenResponse, configuration, now = Date.now()) {
  const expiresInSeconds = Number(tokenResponse?.expires_in);
  if (!tokenResponse?.access_token || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('Google returned an invalid access-token expiry. Please sign in again.');
  }

  const tokenExpiresAt = now + expiresInSeconds * 1000;
  const sessionExpiresAt = now + APPLICATION_SESSION_DURATION_MS;
  const effectiveExpiresAt = Math.min(sessionExpiresAt, tokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS);
  if (effectiveExpiresAt <= now) {
    throw new Error('The Google access token expires too soon. Please sign in again.');
  }

  return {
    accessToken: tokenResponse.access_token,
    issuedAt: now,
    tokenExpiresAt,
    sessionExpiresAt,
    effectiveExpiresAt,
    scope: tokenResponse.scope ?? '',
    clientId: configuration.clientId,
    spreadsheetId: configuration.spreadsheetId,
    sheetRange: configuration.sheetRange,
  };
}

export function isValidPersistedSession(session, configuration, now = Date.now()) {
  return validatePersistedSession(session, configuration, now).valid;
}

export function validatePersistedSession(session, configuration, now = Date.now()) {
  const hasRequiredFields = session
    && typeof session.accessToken === 'string'
    && typeof session.scope === 'string'
    && Number.isFinite(session.issuedAt)
    && Number.isFinite(session.tokenExpiresAt)
    && Number.isFinite(session.sessionExpiresAt)
    && Number.isFinite(session.effectiveExpiresAt);
  if (!hasRequiredFields) return { valid: false, reason: 'invalid' };
  if (session.clientId !== configuration.clientId
    || session.spreadsheetId !== configuration.spreadsheetId
    || session.sheetRange !== configuration.sheetRange) {
    return { valid: false, reason: 'configuration-mismatch' };
  }
  if (now >= session.effectiveExpiresAt) return { valid: false, reason: 'expired' };
  if (session.sessionExpiresAt > session.issuedAt + APPLICATION_SESSION_DURATION_MS
    || session.sessionExpiresAt <= session.issuedAt
    || session.effectiveExpiresAt > session.sessionExpiresAt
    || session.effectiveExpiresAt > session.tokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS) {
    return { valid: false, reason: 'invalid' };
  }
  return { valid: true, reason: null };
}

export class SessionPersistence {
  constructor({ storage, key = SESSION_STORAGE_KEY, now = () => Date.now() } = {}) {
    this.storage = storage ?? window.sessionStorage;
    this.key = key;
    this.now = now;
  }

  save(session) {
    this.storage.setItem(this.key, JSON.stringify(session));
  }

  read(configuration) {
    return this.readWithStatus(configuration).session;
  }

  readWithStatus(configuration) {
    let session;
    try {
      const serialized = this.storage.getItem(this.key);
      if (!serialized) return { session: null, reason: 'missing' };
      session = JSON.parse(serialized);
    } catch {
      this.clear();
      return { session: null, reason: 'malformed' };
    }

    const validation = validatePersistedSession(session, configuration, this.now());
    if (!validation.valid) {
      this.clear();
      return { session: null, reason: validation.reason };
    }
    return { session, reason: null };
  }

  clear() {
    this.storage.removeItem(this.key);
  }
}
