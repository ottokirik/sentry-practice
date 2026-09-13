import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = window.__APP_CONFIG__?.environment ?? "unconfigured";
const stand = window.__APP_CONFIG__?.stand ?? "unconfigured";

Sentry.init({
  dsn,
  environment,
  enabled: import.meta.env.MODE !== "development",
  initialScope: {
    tags: { stand },
  },
});
