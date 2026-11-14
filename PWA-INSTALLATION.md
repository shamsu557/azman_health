# Azman University HealthConnect — PWA installation

HealthConnect can be installed as a Progressive Web App (PWA) when served over HTTPS. `localhost` is supported for local development.

## Desktop (Chrome / Edge)
1. Open the HealthConnect site in Chrome or Edge.
2. When the **Install App** prompt appears, choose **Install App**.
3. If the browser does not offer a native prompt, select Install App in the prompt to see the browser-menu instructions.

## Android
1. Open HealthConnect in Chrome.
2. Choose **Install App** when the prompt appears.
3. If no native prompt appears, choose Install App to see the manual steps: Chrome menu (⋮) → **Install app** or **Add to Home screen** → confirm.

## iPhone / iPad (iOS)
Apple does not provide a normal Safari webpage with a native `beforeinstallprompt` event. Use Safari's Add to Home Screen flow:
1. Open the HealthConnect URL in **Safari** (not an in-app browser).
2. Tap **Share** (the square with an upward arrow).
3. Scroll and select **Add to Home Screen**.
4. Tap **Add**. If the option appears, enable **Open as Web App**.

The install reminder offers this guide when the user taps **Install App** on iOS.

## Prompt behaviour
- The reminder appears on a normal browser visit until installation is detected.
- **Maybe Later** or the close icon hides it only for the current page visit; it can appear on a later visit.
- A successful native installation is remembered in that browser.
- In installed standalone mode, the reminder is hidden.
- Browsers control whether a native install dialog is available; the website cannot force it.

## Privacy and caching
The service worker caches only versioned public shell assets and the static offline information page. It does not cache API responses, login sessions, patient records, private images or documents. Appointment booking, clinical records and WhatsApp links still require an internet connection.

## Deployment
1. Deploy the complete application over HTTPS.
2. Keep the existing `.env`, database and `uploads/` directory.
3. Restart Node.js.
4. Close existing site tabs and reopen the HTTPS site. If an older service worker remains active, refresh after it updates.
5. Test desktop Chrome/Edge, Android Chrome and iPhone Safari.

Run `npm run test:pwa` for the included static PWA checks.
