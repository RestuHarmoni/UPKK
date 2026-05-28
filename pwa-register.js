(function(){
  if (!('serviceWorker' in navigator)) return;

  const SW_VERSION = '4.00-clean-firebase';
  const RELOAD_KEY = 'upkkSmartKidsReloadedForSW_' + SW_VERSION;

  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js?v=' + SW_VERSION, { updateViaCache: 'none' }).then(function(reg){
      try { reg.update(); } catch(e) {}

      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      reg.addEventListener('updatefound', function(){
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function(){
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            try { worker.postMessage({ type: 'SKIP_WAITING' }); } catch(e) {}
          }
        });
      });
    }).catch(function(error){
      console.warn('PWA service worker registration failed:', error);
    });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (refreshing) return;
    refreshing = true;
    if (!sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
    }
  });

  navigator.serviceWorker.addEventListener('message', function(event){
    if (event.data && event.data.type === 'UPKK_SW_UPDATED') {
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
      }
    }
  });
})();
