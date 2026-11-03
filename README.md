# Kasatria 3D Assignment

An ES-module Vite and Three.js CSS3D visualization of 200 people loaded from a private Google Sheet after the user authorizes read access.

## Prerequisites

- Node.js 18, 20, or newer
- npm

## Install and run

```bash
npm install
npm run dev
```

Vite prints the local URL (normally `http://localhost:5173`). The application first shows a Google sign-in screen. After authorization, it reads 200 people from Google Sheets and displays the 3D cards. Use the mouse to rotate, pan, and zoom. Choose **TABLE**, **SPHERE**, **HELIX**, or **GRID** to animate between layouts.

## Google Cloud configuration

1. Create or select a Google Cloud project.
2. Enable the **Google Sheets API** for that project.
3. Configure the OAuth consent screen. While the app is in testing, add each permitted account under **Test users**.
4. Create an OAuth 2.0 **Web application** client ID. Do not create or use a client secret in this frontend project.
5. Add Vite's development origin (normally `http://localhost:5173`) to **Authorized JavaScript origins**. Add the exact production origin later when deploying.
6. Share the target spreadsheet with the Google account that will sign in. The account must have at least viewer access; the spreadsheet must not be made public.

The browser requests `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/spreadsheets.readonly`. OAuth uses Google Identity Services' token model; access tokens stay only in browser memory and are not server-verified by this frontend application.

## Environment setup

Copy `.env.example` to `.env.local`, then provide your browser client ID and the approved sheet configuration:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-browser-client-id.apps.googleusercontent.com
VITE_GOOGLE_SPREADSHEET_ID=1nkX-7uCVRGoxjO0ubgaUiROzm0Q3BFs0mne0y59gh3c
VITE_GOOGLE_SHEET_RANGE=A:F
```

Restart Vite after changing `.env.local`. Vite variables prefixed with `VITE_` are public browser configuration—never place an access token, client secret, or API key in them.

## Production build

```bash
npm run build
npm run preview
```

## Deployment readiness

This is a static Vite application and needs no `vercel.json`, serverless function, or SPA rewrite rule.

1. Push the repository to GitHub, then import it into Vercel.
2. Select the **Vite** framework preset. Set build command to `npm run build` and output directory to `dist`.
3. In Vercel project settings, add these production environment variables:

   ```text
   VITE_GOOGLE_CLIENT_ID
   VITE_GOOGLE_SPREADSHEET_ID
   VITE_GOOGLE_SHEET_RANGE
   ```

   These are public browser configuration values. Never add a client secret, access token, refresh token, or API key.
4. In Google Cloud, add the exact deployed HTTPS origin (for example, `https://your-project.vercel.app`) to the OAuth client's **Authorized JavaScript origins**. Keep the local Vite origin only for development.
5. Redeploy after changing Vercel variables or the OAuth origin.

For production verification, open the deployed URL in a fresh browser session, select **Sign in with Google**, approve Sheets read access, confirm 200 cards load, exercise all four layouts and Reset View, then Sign Out and sign back in. Submit the resulting deployed HTTPS URL only after this check succeeds.

Before deploying, run:

```bash
npm test
npm run build
```

## Project structure

```text
src/
  data/peopleNormalization.js # Shared Google Sheets validation and normalization
  data/netWorth.js       # Net-worth categories and currency formatting
  main.js                # Async application entry point
  peopleCard.js          # Safe person-card DOM construction
  services/googleAuth.js # Google Identity Services token session
  services/googleSheets.js # Authorized Google Sheets REST requests
  styles.css             # Page, controls, legend, and card styles
  visualization.js       # Three.js CSS3D scene and layout animation
test/people.test.js      # CSV, category, and layout tests
test/fixtures/people.csv # Local test fixture; excluded from production output
test-support/parsePeopleCsv.js # Test-only CSV parsing helper
```

## Tests

```bash
npm test
```

## Current scope

The production startup path does not fall back to the local CSV. Google authentication, Sheets loading, the double helix, and the 5×4×10 grid are implemented; a backend and deployment remain out of scope.

## Common errors

- **Google Client ID is missing:** set `VITE_GOOGLE_CLIENT_ID` in `.env.local` and restart Vite.
- **Popup could not be opened:** allow popups for the local Vite origin, then select Sign in with Google again.
- **Access denied / HTTP 403:** add the account as an OAuth test user if applicable and share the spreadsheet with that account.
- **HTTP 404 or invalid range:** confirm the spreadsheet ID and `VITE_GOOGLE_SHEET_RANGE` A1 notation.
- **HTTP 401:** the token has expired; use Sign Out, then sign in again.
- **Expected 200 people records:** confirm the configured range contains the header row plus exactly 200 people rows.
