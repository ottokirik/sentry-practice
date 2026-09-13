// Since we migrated to Vite, the service worker strategy changed, in CRA it was a custom service worker named service-worker.js and in Vite its sw.js handled by vite-plugin-pwa
// Due to this the existing CRA users were not able to migrate to Vite or any new changes post Vite unless browser is hard refreshed
// Hence adding a self destroying worker so all CRA service workers are destroyed and migrated to Vite
// We should remove this code after sometime when we are confident that
// all users have migrated to Vite

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  self.registration
    .unregister()
    .then(() => {
      return self.clients.matchAll();
    })
    .then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    });
});
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="0035af2d-66a3-5fcc-bbe8-c7e3ec66db36")}catch(e){}}();
//# debugId=0035af2d-66a3-5fcc-bbe8-c7e3ec66db36
