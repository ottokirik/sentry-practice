import { useState } from "react";

/**
 * Панель-детонатор для практикума по Sentry.
 *
 * Здесь намеренно НЕТ ни одного импорта из @sentry/*. Панель только ломает
 * приложение шестью разными способами; всё, что касается отправки этих
 * ошибок в Sentry, ты пишешь сам по лабам.
 *
 * Каждое сообщение начинается с "SENTRY LAB:" — по этой строке удобно
 * искать свои события в интерфейсе Sentry, не путая их с чужим шумом.
 */

const BoomOnRender = () => {
  throw new Error("SENTRY LAB: error thrown during React render");
};

type Detonator = {
  id: string;
  label: string;
  hint: string;
  fire: () => void;
};

const panelStyle: React.CSSProperties = {
  position: "fixed",
  bottom: "1rem",
  left: "1rem",
  zIndex: 10000,
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  padding: "0.75rem",
  borderRadius: "8px",
  background: "rgba(20, 20, 24, 0.92)",
  color: "#f5f5f5",
  font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
  maxWidth: "22rem",
};

const buttonStyle: React.CSSProperties = {
  all: "unset",
  cursor: "pointer",
  padding: "0.35rem 0.5rem",
  borderRadius: "4px",
  background: "#2f2f38",
  color: "#f5f5f5",
  textAlign: "left",
};

export const DebugPanel = () => {
  const [open, setOpen] = useState(false);
  const [renderBoom, setRenderBoom] = useState(false);

  const detonators: Detonator[] = [
    {
      id: "sync",
      label: "1. Синхронный throw",
      hint: "Обычная ошибка прямо в обработчике клика.",
      fire: () => {
        throw new Error("SENTRY LAB: synchronous throw in a click handler");
      },
    },
    {
      id: "rejection",
      label: "2. Unhandled promise rejection",
      hint: "Промис падает, .catch() никто не повесил.",
      fire: () => {
        void Promise.reject(
          new Error("SENTRY LAB: unhandled promise rejection"),
        );
      },
    },
    {
      id: "timeout",
      label: "3. Ошибка в setTimeout",
      hint: "Стек оторван от обработчика — проверка, что ловится и такое.",
      fire: () => {
        setTimeout(() => {
          throw new Error("SENTRY LAB: throw inside setTimeout callback");
        }, 0);
      },
    },
    {
      id: "lazy",
      label: "4. Ошибка в ленивом чанке",
      hint: "Проверяет, что карты залиты не только для главного бандла.",
      fire: () => {
        void import("./lazyBoom").then(({ boomInsideLazyChunk }) => {
          boomInsideLazyChunk();
        });
      },
    },
    {
      id: "console",
      label: "5. console.error",
      hint: "Не исключение. Долетит только если ты сам настроишь.",
      fire: () => {
        // eslint-disable-next-line no-console
        console.error("SENTRY LAB: plain console.error call", {
          detail: "no exception object here",
        });
      },
    },
    {
      id: "render",
      label: "6. Ошибка при рендере React",
      hint: "Уронит приложение до экрана ошибки — поможет перезагрузка.",
      fire: () => {
        setRenderBoom(true);
      },
    },
  ];

  if (renderBoom) {
    return <BoomOnRender />;
  }

  if (!open) {
    return (
      <button
        style={{ ...buttonStyle, ...panelStyle, flexDirection: "row" }}
        onClick={() => setOpen(true)}
      >
        💣 Sentry lab
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>Панель-детонатор</strong>
        <button style={buttonStyle} onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <div style={{ opacity: 0.6 }}>
        mode: {import.meta.env.MODE} · PROD: {String(import.meta.env.PROD)} ·
        release: {import.meta.env.VITE_APP_RELEASE || "(не задан)"}
      </div>
      {detonators.map((detonator) => (
        <button
          key={detonator.id}
          style={buttonStyle}
          title={detonator.hint}
          onClick={detonator.fire}
        >
          {detonator.label}
        </button>
      ))}
    </div>
  );
};
