#!/usr/bin/env node
//
// Поддельный бэкенд ссылок «поделиться» для лабы 09.
//
//   node excalidraw-app/debug/fake-scene-backend.mjs [порт]
//
// Отвечает на GET /api/v2/<id>, где <id> выбирает сценарий:
//   missing     → 404: ссылка устарела
//   error       → 500: сбой бэкенда
//   unavailable → 503: бэкенд перегружен
//   garbage     → 200, но вместо зашифрованной сцены — мусор
// Любой другой id → 404.
//
// Сетевой сбой проверяется просто: останови этот процесс.
import http from "node:http";

const port = Number(process.argv[2] ?? 5083);

const scenarios = {
  missing: [404, "not found"],
  error: [500, "internal error"],
  unavailable: [503, "service unavailable"],
  garbage: [200, "definitely not an encrypted scene"],
};

http
  .createServer((req, res) => {
    const id = (req.url ?? "").split("/").filter(Boolean).pop() ?? "";
    const [status, body] = scenarios[id] ?? [404, "unknown id"];
    res.writeHead(status, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/octet-stream",
    });
    res.end(body);
    console.log(`${req.method} ${req.url} → ${status}`);
  })
  .listen(port, () => {
    console.log(`поддельный бэкенд сцен: http://localhost:${port}/api/v2/`);
  });
