import './styles.css';
import { GoogleTokenSession } from './services/googleAuth.js';
import { loadPeopleFromGoogleSheets } from './services/googleSheets.js';
import { SessionChannel } from './services/sessionChannel.js';
import { SessionPersistence, createPersistedSession, isValidPersistedSession } from './services/sessionPersistence.js';
import { PeopleVisualization } from './visualization.js';

const configuration = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  spreadsheetId: import.meta.env.VITE_GOOGLE_SPREADSHEET_ID,
  sheetRange: import.meta.env.VITE_GOOGLE_SHEET_RANGE || 'A:F',
};

const authScreen = document.querySelector('#auth-screen');
const appShell = document.querySelector('#app-shell');
const authStatus = document.querySelector('#auth-status');
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
  setAuthStatus(message, isError);
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

async function restoreOrLoadSession(session, { strictProfileValidation }) {
  if (!isValidPersistedSession(session, configuration)) return false;
  const attemptVersion = ++sessionVersion;
  const attemptInvalidationVersion = invalidationVersion;
  accessToken = session.accessToken;
  setAuthStatus('Restoring your Google session…');

  try {
    const profilePromise = googleSession.getUserProfile(accessToken);
    const peoplePromise = loadPeopleFromGoogleSheets({
      accessToken,
      spreadsheetId: configuration.spreadsheetId,
      range: configuration.sheetRange,
    });
    const [profile, people] = await Promise.all([
      strictProfileValidation ? profilePromise : profilePromise.catch(() => ({ name: 'Google account', email: '' })),
      peoplePromise,
    ]);
    if (attemptVersion !== sessionVersion || attemptInvalidationVersion !== invalidationVersion) return false;
    if (people.length !== 200) throw new Error(`Expected 200 people records but received ${people.length}.`);
    showAuthenticatedApp(profile, people);
    return true;
  } catch (error) {
    if (attemptVersion !== sessionVersion || attemptInvalidationVersion !== invalidationVersion) return false;
    accessToken = null;
    if (isAuthenticationFailure(error)) {
      invalidateSession('Your session has expired. Please sign in again.', true);
    } else {
      returnToLogin(error.message, true);
    }
    return false;
  }
}

async function signIn() {
  signInButton.disabled = true;
  setAuthStatus('Opening Google sign-in…');

  try {
    const tokenResponse = await googleSession.requestAccessToken();
    const session = createPersistedSession(tokenResponse, configuration);
    sessionPersistence.save(session);
    setAuthStatus('Loading people from Google Sheets…');
    await restoreOrLoadSession(session, { strictProfileValidation: false });
  } catch (error) {
    invalidateSession(error.message, true);
  } finally {
    if (!visualization) signInButton.disabled = false;
  }
}

function signOut({ broadcast = true, message = 'You have signed out. Sign in with Google to continue.' } = {}) {
  const tokenToRevoke = accessToken;
  invalidateSession(message);
  googleSession.revoke(tokenToRevoke);
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
    setAuthStatus('Google Spreadsheet ID is missing. Add VITE_GOOGLE_SPREADSHEET_ID to .env.local.', true);
    signInButton.disabled = true;
    return;
  }

  try {
    setAuthStatus('Preparing secure Google sign-in…');
    await googleSession.initialize();

    const storedSession = sessionPersistence.read(configuration);
    if (storedSession && await restoreOrLoadSession(storedSession, { strictProfileValidation: true })) return;

    const channelRequestInvalidationVersion = invalidationVersion;
    const sharedSession = await sessionChannel.requestSession();
    if (channelRequestInvalidationVersion !== invalidationVersion) return;
    if (sharedSession && isValidPersistedSession(sharedSession, configuration)) {
      sessionPersistence.save(sharedSession);
      if (await restoreOrLoadSession(sharedSession, { strictProfileValidation: true })) return;
    }

    setAuthStatus('Sign in with Google to load the people visualization.');
    signInButton.disabled = false;
  } catch (error) {
    setAuthStatus(error.message, true);
    signInButton.disabled = true;
  }
}

initializeAuthentication();
