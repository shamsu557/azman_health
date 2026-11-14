/* Azman HealthConnect PWA install guide: desktop, Android and iOS. */
'use strict';
(function () {
  const root = document.getElementById('pwaInstallRoot');
  if (!root) return;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const installedKey = 'azman-healthconnect-pwa-installed';
  let deferredPrompt = null, dismissedForThisVisit = false, showManual = false, installed = false;
  function isStandalone() {
    return (typeof window.matchMedia === 'function' && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone === true || (typeof document.referrer === 'string' && document.referrer.startsWith('android-app://'));
  }
  function savedInstalled() { try { return localStorage.getItem(installedKey) === '1'; } catch (_) { return false; } }
  function saveInstalled() { try { localStorage.setItem(installedKey, '1'); } catch (_) {} }
  function hide() { root.replaceChildren(); }
  function dismiss() { dismissedForThisVisit = true; hide(); }
  function markInstalled() { installed = true; deferredPrompt = null; saveInstalled(); hide(); }
  installed = isStandalone() || savedInstalled();
  function manualSteps() {
    if (isIOS) return '<ol class="pwa-steps"><li>Open this website in <strong>Safari</strong> on your iPhone or iPad.</li><li>Tap the <strong>Share</strong> icon (the square with an upward arrow).</li><li>Scroll and choose <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>. If shown, enable <strong>Open as Web App</strong>.</li></ol>';
    if (isAndroid) return '<ol class="pwa-steps"><li>Open this site in <strong>Chrome</strong>.</li><li>Tap <strong>⋮</strong> and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li><li>Confirm the installation.</li></ol>';
    return '<ol class="pwa-steps"><li>Open this site in <strong>Chrome</strong> or <strong>Edge</strong>.</li><li>Choose the <strong>Install</strong> icon in the address bar, or open the browser menu and select <strong>Install this site as an app</strong>.</li><li>Confirm <strong>Install</strong>.</li></ol>';
  }
  function render() {
    if (dismissedForThisVisit || installed || isStandalone()) { hide(); return; }
    const subtitle = isIOS ? 'Add HealthConnect to your Home Screen.' : (isAndroid ? 'Install for quick access to university healthcare.' : 'Open HealthConnect like a desktop app.');
    root.innerHTML = '<section class="pwa-install" role="region" aria-label="Install Azman HealthConnect">' +
      '<div class="pwa-install-header"><img class="pwa-install-icon" src="/assets/icons/icon-192.png" alt="Azman HealthConnect icon">' +
      '<div class="pwa-install-info"><h2 class="pwa-install-title">Install App</h2><p class="pwa-install-subtitle">' + subtitle + '</p></div>' +
      '<button type="button" class="pwa-install-close" data-pwa="later" aria-label="Close">&times;</button></div>' +
      (showManual ? manualSteps() : '') +
      '<div class="pwa-install-buttons"><button type="button" class="pwa-btn pwa-btn-secondary" data-pwa="later">Maybe Later</button><button type="button" class="pwa-btn pwa-btn-primary" data-pwa="install">Install App</button></div>' +
      (isIOS && showManual ? '<p class="pwa-install-note">Apple requires installation from Safari’s Share menu. This guide is for iPhone and iPad.</p>' : '') + '</section>';
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-pwa]'); if (!button) return;
    if (button.dataset.pwa === 'later') { dismiss(); return; }
    if (button.dataset.pwa !== 'install') return;
    if (!isIOS && deferredPrompt) {
      const prompt = deferredPrompt; deferredPrompt = null;
      try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice && choice.outcome === 'accepted') { markInstalled(); return; } dismiss(); return; }
      catch (_) { /* Show browser instructions if native prompt is unavailable. */ }
    }
    showManual = true; render();
  });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredPrompt = event; if (!dismissedForThisVisit && !installed) render(); });
  window.addEventListener('appinstalled', markInstalled);
  if (typeof window.matchMedia === 'function') { const media = window.matchMedia('(display-mode: standalone)'); if (media.addEventListener) media.addEventListener('change', () => { if (isStandalone()) markInstalled(); }); }
  window.addEventListener('pageshow', () => { if (isStandalone()) markInstalled(); });
  if (!installed) window.setTimeout(render, 900);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
