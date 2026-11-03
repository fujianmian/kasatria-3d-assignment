import './styles.css';
import { GoogleTokenSession } from './services/googleAuth.js';
import { loadPeopleFromGoogleSheets } from './services/googleSheets.js';
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
const googleSession = new GoogleTokenSession({ clientId: configuration.clientId });

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

async function signIn() {
  signInButton.disabled = true;
  setAuthStatus('Opening Google sign-in…');

  try {
    accessToken = await googleSession.requestAccessToken();
    setAuthStatus('Loading people from Google Sheets…');
    const [profile, people] = await Promise.all([
      googleSession.getUserProfile(accessToken).catch(() => ({ name: 'Google account', email: '' })),
      loadPeopleFromGoogleSheets({
        accessToken,
        spreadsheetId: configuration.spreadsheetId,
        range: configuration.sheetRange,
      }),
    ]);
    if (people.length !== 200) {
      throw new Error(`Expected 200 people records but received ${people.length}.`);
    }
    showAuthenticatedApp(profile, people);
  } catch (error) {
    accessToken = null;
    returnToLogin(error.message, true);
  } finally {
    signInButton.disabled = false;
  }
}

function signOut() {
  const tokenToRevoke = accessToken;
  accessToken = null;
  googleSession.revoke(tokenToRevoke);
  returnToLogin('You have signed out. Sign in with Google to continue.');
}

layoutButtons.forEach((button) => {
  button.addEventListener('click', () => {
    visualization?.transformTo(button.dataset.layout);
    setActiveLayout(button.dataset.layout);
  });
});
signInButton.addEventListener('click', signIn);
signOutButton.addEventListener('click', signOut);

async function initializeAuthentication() {
  if (!configuration.spreadsheetId) {
    setAuthStatus('Google Spreadsheet ID is missing. Add VITE_GOOGLE_SPREADSHEET_ID to .env.local.', true);
    signInButton.disabled = true;
    return;
  }

  try {
    setAuthStatus('Preparing secure Google sign-in…');
    await googleSession.initialize();
    setAuthStatus('Sign in with Google to load the people visualization.');
    signInButton.disabled = false;
  } catch (error) {
    setAuthStatus(error.message, true);
    signInButton.disabled = true;
  }
}

initializeAuthentication();
