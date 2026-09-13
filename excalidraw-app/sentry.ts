import * as Sentry from "@sentry/react";

type ErrorEvent = Parameters<
  NonNullable<Sentry.BrowserOptions["beforeSend"]>
>[0];
type TransactionEvent = Parameters<
  NonNullable<Sentry.BrowserOptions["beforeSendTransaction"]>
>[0];

function generateId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

let storageAvailable = true;

function getOrCreateAnonymousId() {
  const lsKey = "anonymousId";
  try {
    const anonymousId = localStorage.getItem(lsKey);
    if (anonymousId) {
      return anonymousId;
    }
    const newAnonymousId = generateId();
    localStorage.setItem(lsKey, newAnonymousId);
    return newAnonymousId;
  } catch (e) {
    storageAvailable = false;
    return generateId();
  }
}

const SECRET_IN_HASH = /#(?:room|json)=[^\s"'<>\\]*/g;

function scrubSecrets<T extends ErrorEvent | TransactionEvent>(
  event: T,
): T | null {
  const keys: Array<keyof T> = Object.keys(event) as Array<keyof T>;

  try {
    for (const key of keys) {
      if (key === "sdkProcessingMetadata") {
        continue;
      }

      const json = JSON.stringify(event[key]);

      if (json !== undefined) {
        event[key] = JSON.parse(json.replace(SECRET_IN_HASH, ""));
      }
    }

    return event;
  } catch {
    // Не смогли вычистить — не отправляем: потерять событие лучше, чем ключ.
    return null;
  }
}

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = window.__APP_CONFIG__?.environment ?? "unconfigured";
const stand = window.__APP_CONFIG__?.stand ?? "unconfigured";
const tracesSampleRate = window.__APP_CONFIG__?.sentry?.tracesSampleRate ?? 0.1;

Sentry.init({
  dsn,
  environment,
  enabled: import.meta.env.MODE !== "development",
  initialScope: {
    tags: { stand },
  },
  release: import.meta.env.VITE_APP_RELEASE,
  ignoreErrors: [
    "undefined is not an object (evaluating 'window.__pad.performLoop')", // Only happens on Safari, but spams our servers. Doesn't break anything
    "InvalidStateError: Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.", // Not much we can do about the IndexedDB closing error
    /(Failed to fetch|(fetch|loading) dynamically imported module)/i, // This is happening when a service worker tries to load an old asset
    /QuotaExceededError: (The quota has been exceeded|.*setItem.*Storage)/i, // localStorage quota exceeded
    "Internal error opening backing store for indexedDB.open", // Private mode and disabled indexedDB
    "ResizeObserver loop limit exceeded",
  ],
  denyUrls: [/^(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i],
  tracesSampleRate,
  sampleRate: 1.0,
  integrations: [Sentry.browserTracingIntegration()],

  beforeSend: scrubSecrets,
  beforeSendTransaction: scrubSecrets,
});

Sentry.setUser({ id: getOrCreateAnonymousId() });
if (!storageAvailable) {
  Sentry.setTag("storage", "unavailable");
}
