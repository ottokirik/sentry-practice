import "@excalidraw/excalidraw/global";
import "@excalidraw/excalidraw/css";

interface Window {
  __EXCALIDRAW_SHA__: string | undefined;
}

// Файл — модуль (в нём есть import), поэтому глобальные типы расширяются
// только через declare global.
declare global {
  // Конфигурация стенда. Пишется при раскатке в config.js
  // (deploy/render-config.sh) и в сборку не входит: артефакт один на все
  // стенды. На дев-сервере её нет.
  interface AppRuntimeConfig {
    environment: string;
    stand: string;
    sentry: {
      tracesSampleRate: number;
    };
  }

  interface Window {
    __APP_CONFIG__?: AppRuntimeConfig;
  }
}
