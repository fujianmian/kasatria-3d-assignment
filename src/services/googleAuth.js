const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];
const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let googleIdentityServicesPromise;

export function loadGoogleIdentityServices(documentReference = document, windowReference = window) {
  if (windowReference.google?.accounts?.oauth2) return Promise.resolve(windowReference.google);
  if (googleIdentityServicesPromise) return googleIdentityServicesPromise;

  googleIdentityServicesPromise = new Promise((resolve, reject) => {
    const script = documentReference.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (windowReference.google?.accounts?.oauth2) resolve(windowReference.google);
      else reject(new Error('Google Identity Services did not initialize correctly.'));
    };
    script.onerror = () => reject(new Error('Google Identity Services could not be loaded. Check your connection and try again.'));
    documentReference.head.append(script);
  });

  return googleIdentityServicesPromise.catch((error) => {
    googleIdentityServicesPromise = undefined;
    throw error;
  });
}

function getAuthorizationError(error) {
  const errorType = error?.type ?? error?.error;
  if (errorType === 'popup_closed') return 'Google sign-in was cancelled.';
  if (errorType === 'popup_failed_to_open') return 'Google sign-in popup could not be opened. Allow popups and try again.';
  if (errorType === 'access_denied') return 'Google Sheets access was not granted.';
  return error?.error_description || 'Google authorization could not be completed.';
}

export class GoogleTokenSession {
  constructor({ clientId, loadIdentityServices = loadGoogleIdentityServices, fetchImplementation = fetch }) {
    this.clientId = clientId;
    this.loadIdentityServices = loadIdentityServices;
    this.fetchImplementation = fetchImplementation;
    this.google = null;
    this.tokenClient = null;
    this.pendingAuthorization = null;
  }

  async initialize() {
    if (!this.clientId) throw new Error('Google Client ID is missing. Add VITE_GOOGLE_CLIENT_ID to .env.local.');
    this.google = await this.loadIdentityServices();
    this.tokenClient = this.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: GOOGLE_SCOPES.join(' '),
      callback: (response) => this.handleTokenResponse(response),
      error_callback: (error) => this.handleAuthorizationError(error),
    });
  }

  requestAccessToken() {
    if (!this.tokenClient) return Promise.reject(new Error('Google sign-in is not ready yet.'));
    if (this.pendingAuthorization) return Promise.reject(new Error('Google sign-in is already in progress.'));

    return new Promise((resolve, reject) => {
      this.pendingAuthorization = { resolve, reject };
      try {
        this.tokenClient.requestAccessToken({ prompt: 'select_account consent' });
      } catch (error) {
        this.handleAuthorizationError(error);
      }
    });
  }

  handleTokenResponse(response) {
    if (response?.error || !response?.access_token) {
      this.handleAuthorizationError(response);
      return;
    }

    const hasSheetsScope = this.google.accounts.oauth2.hasGrantedAllScopes?.(response, SHEETS_READONLY_SCOPE)
      ?? response.scope?.split(' ').includes(SHEETS_READONLY_SCOPE);
    if (!hasSheetsScope) {
      this.handleAuthorizationError({
        error: 'access_denied',
        error_description: 'Google Sheets read access is required. Please approve the requested permission and try again.',
      });
      return;
    }

    this.pendingAuthorization?.resolve(response.access_token);
    this.pendingAuthorization = null;
  }

  handleAuthorizationError(error) {
    this.pendingAuthorization?.reject(new Error(getAuthorizationError(error)));
    this.pendingAuthorization = null;
  }

  async getUserProfile(accessToken) {
    const response = await this.fetchImplementation('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Unable to retrieve the signed-in Google account details.');
    const profile = await response.json();
    return {
      name: profile.name || profile.email || 'Google account',
      email: profile.email || '',
    };
  }

  revoke(accessToken) {
    if (!accessToken || !this.google?.accounts?.oauth2?.revoke) return;
    this.google.accounts.oauth2.revoke(accessToken, () => {});
  }
}
