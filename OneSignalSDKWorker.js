/* Asansör Bakım & Revizyon v2.3.46 — bağlantı ekranı ve bildirimler */
"use strict";

// No account records or API responses are cached by this worker.
const ABR_OFFLINE_HTML = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f5f6fa">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Asansör Bakım &amp; Revizyon">
<link rel="manifest" href="manifest.webmanifest">
<title>Asansör Bakım &amp; Revizyon</title>
<style>
*{box-sizing:border-box}html{height:100%;background:#f5f6fa}body{margin:0;min-height:100%;min-height:100svh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#19283e;padding:calc(32px + env(safe-area-inset-top)) 28px calc(24px + env(safe-area-inset-bottom));display:flex;flex-direction:column;background:radial-gradient(ellipse at 100% 0%,#dce8f8,transparent 55%),#f5f6fa}header{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:700;letter-spacing:1px}header svg{width:30px;height:40px;color:#ff6b00;flex-shrink:0}header small{display:block;font-size:10px;font-weight:500;letter-spacing:2px;color:#768295;margin-top:5px}main{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;max-width:380px;width:100%;margin:auto;padding:48px 0}main svg{width:64px;height:64px;color:#7186a0;margin-bottom:28px}h1{font-size:32px;line-height:1.15;letter-spacing:-1px;margin:0 0 16px;font-weight:750}p{font-size:16px;line-height:1.6;color:#6d798b;margin:0 0 28px}button{border:0;border-radius:16px;min-height:54px;background:#1b3b60;color:white;font:600 16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;width:100%;padding:16px;cursor:pointer}button:active{transform:scale(.98)}button:focus-visible{outline:3px solid #ff6b00;outline-offset:4px}#status{font-size:13px;line-height:1.5;color:#7c8797;margin-top:16px;min-height:40px}footer{font-size:12px;line-height:1.5;color:#8a94a3} @media(prefers-reduced-motion:reduce){button:active{transform:none}}
</style></head><body>
<header><svg viewBox="0 0 32 44" fill="none" aria-hidden="true"><path d="M10 4H7a4 4 0 0 0-4 4v28a4 4 0 0 0 4 4h3m12-36h3a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4h-3M11 7l5-5 5 5M11 37l5 5 5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M9 12h6v20H9zm8 0h6v20h-6z" fill="currentColor"/></svg><div>ASANSÖR<small>BAKIM &amp; REVİZYON</small></div></header>
<main><svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M10 23a35 35 0 0 1 44 0M18 33a23 23 0 0 1 28 0m-20 9a10 10 0 0 1 12 0M9 9l46 46" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="51" r="3" fill="currentColor"/></svg>
<h1>İnternet bağlantısı yok.</h1>
<p>Uygulamayı açmak için bağlantını kontrol et. Bağlantı geldiğinde kaldığın yerden devam edebilirsin.</p>
<button type="button" id="retry">Tekrar dene</button>
<div id="status" role="status" aria-live="polite">Bu ekran kayıtlarını değiştirmez.</div></main>
<footer>Asansör Bakım &amp; Revizyon</footer>
<script>
function retry(){document.getElementById('status').textContent='Bağlantı kontrol ediliyor…';window.location.reload();}
document.getElementById('retry').addEventListener('click',retry);
window.addEventListener('online',retry);
</script></body></html>`;

function abrOfflineResponse(){
  return new Response(ABR_OFFLINE_HTML, {status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
}

self.addEventListener("fetch",function(event){
  const request=event.request;
  const url=new URL(request.url);
  // Leave notifications, assets, external links and all data calls untouched.
  if(request.method!=="GET" || request.mode!=="navigate" || url.origin!==self.location.origin)return;
  event.respondWith((async function(){
    const controller=new AbortController();
    const timeout=setTimeout(function(){controller.abort();},12000);
    try{return await fetch(request,{signal:controller.signal});}
    catch(error){return abrOfflineResponse();}
    finally{clearTimeout(timeout);}
  })());
});

self.addEventListener("install",function(event){event.waitUntil(self.skipWaiting());});
self.addEventListener("activate",function(event){event.waitUntil(self.clients.claim());});

// Keep the existing push worker; an unavailable CDN must not break offline navigation.
try{importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");}
catch(error){console.warn("Bildirim bağlantısı kurulamadı; çevrimdışı ekran hazır.");}
