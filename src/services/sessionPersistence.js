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
  return Boolean(
    session
    && typeof session.accessToken === 'string'
    && typeof session.scope === 'string'
    && Number.isFinite(session.issuedAt)
    && Number.isFinite(session.tokenExpiresAt)
    && Number.isFinite(session.sessionExpiresAt)
    && Number.isFinite(session.effectiveExpiresAt)
    && session.clientId === configuration.clientId
    && session.spreadsheetId === configuration.spreadsheetId
    && session.sheetRange === configuration.sheetRange
    && now < session.effectiveExpiresAt
    && session.sessionExpiresAt <= session.issuedAt + APPLICATION_SESSION_DURATION_MS
    && session.effectiveExpiresAt <= session.sessionExpiresAt
    && session.effectiveExpiresAt <= session.tokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS,
  );
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
    let session;
    try {
      const serialized = this.storage.getItem(this.key);
      if (!serialized) return null;
      session = JSON.parse(serialized);
    } catch {
      this.clear();
      return null;
    }

    if (!isValidPersistedSession(session, configuration, this.now())) {
      this.clear();
      return null;
    }
    return session;
  }

  clear() {
    this.storage.removeItem(this.key);
  }
}
