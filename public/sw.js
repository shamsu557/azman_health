/* Azman HealthConnect PWA: cache public shell assets only. Never cache API or patient data. */
'use strict';
const VERSION='azman-healthconnect-static-v1-20261114';
const ASSETS=['/offline.html','/assets/offline.css','/assets/css/style.css','/assets/pwa.css','/assets/js/app.js','/assets/js/pwa-install.js','/assets/js/clinical-console.js','/assets/js/recovery.js','/assets/js/admin-recovery.js','/assets/images/logo.svg','/assets/images/health-pattern.svg','/assets/images/medical-background.jpg','/assets/icons/icon-192.png','/assets/icons/icon-512.png','/assets/icons/icon-maskable-512.png','/assets/icons/apple-touch-icon.png'];
const PUBLIC_ASSETS=new Set(ASSETS.filter(p=>p!=='/offline.html'));
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('azman-healthconnect-static-')&&n!==VERSION).map(n=>caches.delete(n)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));return;}if(!PUBLIC_ASSETS.has(url.pathname))return;event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));});
