import './styles.css';
import { GoogleTokenSession } from './services/googleAuth.js';
import { loadPeopleFromGoogleSheets } from './services/googleSheets.js';
import { SessionChannel } from './services/sessionChannel.js';
import { SessionPersistence, createPersistedSession, isValidPersistedSession } from './services/sessionPersistence.js';
import { restoreAuthorizedSession } from './services/sessionRestoration.js';
import { PeopleVisualization } from './visualization.js';

const configuration = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  spreadsheetId: import.meta.env.VITE_GOOGLE_SPREADSHEET_ID,
  sheetRange: import.meta.env.VITE_GOOGLE_SHEET_RANGE || 'A:F',
};

const authScreen = document.querySelector('#auth-screen');
const appShell = document.querySelector('#app-shell');
const authStatus = document.querySelector('#auth-status');
const authTitle = document.querySelector('#auth-title');
const authDescription = document.querySelector('#auth-description');
const appStatus = document.querySelector('#status');
const signInButton = document.querySelector('#sign-in-button');
const signOutButton = document.querySelector('#sign-out-button');
const accountName = document.querySelector('#account-name');
const accountEmail = document.querySelector('#account-email');
const container = document.querySelector('#visualization');
const layoutButtons = document.querySelectorAll('[data-layout]');

let visualization = null;
let accessToken = null;
let sessionVersion = 0;
let invalidationVersion = 0;
let isGoogleReady = false;
let isSignInInProgress = false;
const googleSession = new GoogleTokenSession({ clientId: configuration.clientId });
const sessionPersistence = new SessionPersistence();
const sessionChannel = new SessionChannel({
  getSession: () => sessionPersistence.read(configuration),
  onSignOut: () => handleRemoteSignOut(),
});

function setAuthStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.classList.toggle('status--error', isError);
}

function showRestoringState(message) {
  authScreen.dataset.state = 'initializing';
  authTitle.textContent = 'Preparing People Visualization';
  authDescription.textContent = 'Checking your saved Google session…';
  signInButton.hidden = true;
  signInButton.disabled = true;
  setAuthStatus(message);
}

function showSignInState(message, isError = false) {
  authScreen.dataset.state = 'sign-in';
  authTitle.textContent = 'Welcome to People Visualization';
  authDescription.textContent = 'Sign in with Google to securely read the shared people dataset from Google Sheets.';
  signInButton.hidden = false;
  signInButton.disabled = !isGoogleReady;
  setAuthStatus(message, isError);
}

function setAppControlsEnabled(enabled) {
  layoutButtons.forEach((button) => { button.disabled = !enabled; });
}

function setActiveLayout(layout) {
  layoutButtons.forEach((button) => {
    const isActive = button.dataset.layout === layout;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function showAuthenticatedApp(profile, people) {
  if (visualization) return;
  accountName.textContent = profile.name;
  accountEmail.textContent = profile.email;
  authScreen.hidden = true;
  appShell.hidden = false;
  visualization = new PeopleVisualization(container, people);
  setAppControlsEnabled(true);
  setActiveLayout('table');
  appStatus.classList.add('status--success');
  appStatus.textContent = `${people.length} people loaded from Google Sheets. Drag to rotate, scroll to zoom.`;
}

function returnToLogin(message, isError = false) {
  setAppControlsEnabled(false);
  visualization?.dispose();
  visualization = null;
  accountName.textContent = '';
  accountEmail.textContent = '';
  appShell.hidden = true;
  appStatus.classList.remove('status--success');
  authScreen.hidden = false;
  showSignInState(message, isError);
}

function invalidateSession(message, isError = false) {
  sessionVersion += 1;
  invalidationVersion += 1;
  accessToken = null;
  sessionPersistence.clear();
  returnToLogin(message, isError);
}

function isAuthenticationFailure(error) {
  return error?.code === 'UNAUTHORIZED';
}

function logRestoreDiagnostic(stage, error) {
  if (!import.meta.env.DEV) return;
  console.warn('[Session restoration]', {
    stage,
    code: error?.code ?? 'unknown',
    message: error?.message ?? 'No diagnostic message',
  });
}

async function restoreOrLoadSession(session) {
  if (!isValidPersistedSession(session, configuration)) {
    return { restored: false, error: new Error('The saved session is no longer valid.') };
  }
  const attemptVersion = ++sessionVersion;
  const attemptInvalidationVersion = invalidationVersion;
  accessToken = session.accessToken;
  setAuthStatus('Restoring your Google session…');

  try {
    const { profile, people, profileError } = await restoreAuthorizedSession({
      accessToken,
      googleSession,
      loadPeople: ({ accessToken: restoredToken }) => loadPeopleFromGoogleSheets({
        accessToken: restoredToken,
        spreadsheetId: configuration.spreadsheetId,
        range: configuration.sheetRange,
      }),
    });
    if (attemptVersion !== sessionVersion || attemptInvalidationVersion !== invalidationVersion) {
      return { restored: false, stale: true };
    }
    if (profileError) logRestoreDiagnostic('Userinfo unavailable; fallback profile applied', profileError);
    showAuthenticatedApp(profile, people);
    return { restored: true };
  } catch (error) {
    if (attemptVersion !== sessionVersion || attemptInvalidationVersion !== invalidationVersion) {
      return { restored: false, stale: true };
    }
    accessToken = null;
    logRestoreDiagnostic('Google validation failed', error);
    if (isAuthenticationFailure(error)) {
      invalidateSession('Your session has expired. Please sign in again.', true);
    } else {
      returnToLogin(error.message, true);
    }
    return { restored: false, error };
  }
}

async function signIn() {
  if (!isGoogleReady || isSignInInProgress) return;
  isSignInInProgress = true;
  signInButton.disabled = true;
  setAuthStatus('Opening Google sign-in…');

  try {
    const tokenResponse = await googleSession.requestAccessToken();
    const session = createPersistedSession(tokenResponse, configuration);
    sessionPersistence.save(session);
    setAuthStatus('Loading people from Google Sheets…');
    await restoreOrLoadSession(session);
  } catch (error) {
    invalidateSession(error.message, true);
  } finally {
    isSignInInProgress = false;
    if (!visualization) signInButton.disabled = false;
  }
}

function signOut({ broadcast = true, message = 'You have signed out. Sign in with Google to continue.' } = {}) {
  invalidateSession(message);
  if (broadcast) sessionChannel.broadcastSignOut();
}

function handleRemoteSignOut() {
  invalidateSession('Your session was signed out in another tab. Please sign in again.');
}

layoutButtons.forEach((button) => {
  button.addEventListener('click', () => {
    visualization?.transformTo(button.dataset.layout);
    setActiveLayout(button.dataset.layout);
  });
});
signInButton.addEventListener('click', signIn);
signOutButton.addEventListener('click', () => signOut());
window.addEventListener('pagehide', () => sessionChannel.close(), { once: true });

async function initializeAuthentication() {
  if (!configuration.spreadsheetId) {
    showSignInState('Google Spreadsheet ID is missing. Add VITE_GOOGLE_SPREADSHEET_ID to .env.local.', true);
    signInButton.disabled = true;
    return;
  }

  try {
    showRestoringState('Preparing secure Google sign-in…');
    await googleSession.initialize();
    isGoogleReady = true;

    const storedSessionResult = sessionPersistence.readWithStatus(configuration);
    let restorationError = null;
    if (storedSessionResult.session) {
      const result = await restoreOrLoadSession(storedSessionResult.session);
      if (result.restored) return;
      restorationError = result.error ?? null;
    } else if (storedSessionResult.reason !== 'missing') {
      const messages = {
        malformed: 'The saved session was malformed and has been cleared. Please sign in again.',
        invalid: 'The saved session was invalid and has been cleared. Please sign in again.',
        expired: 'Your session has expired. Please sign in again.',
        'configuration-mismatch': 'The saved session does not match the current application configuration. Please sign in again.',
      };
      restorationError = new Error(messages[storedSessionResult.reason] ?? 'Unable to restore the saved session.');
      setAuthStatus(restorationError.message, true);
      logRestoreDiagnostic(`Stored session ${storedSessionResult.reason}`, restorationError);
    }

    const channelRequestInvalidationVersion = invalidationVersion;
    const sharedSession = await sessionChannel.requestSession();
    if (channelRequestInvalidationVersion !== invalidationVersion) return;
    if (sharedSession && isValidPersistedSession(sharedSession, configuration)) {
      sessionPersistence.save(sharedSession);
      const result = await restoreOrLoadSession(sharedSession);
      if (result.restored) return;
      restorationError = result.error ?? restorationError;
    }

    showSignInState(
      restorationError?.message ?? 'Sign in with Google to load the people visualization.',
      Boolean(restorationError),
    );
  } catch (error) {
    showSignInState(error.message, true);
  }
}

initializeAuthentication();
