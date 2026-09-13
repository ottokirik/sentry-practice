import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = import.meta.env.MODE;

Sentry.init({
  dsn,
  environment,
  enabled: environment !== "development",
});
