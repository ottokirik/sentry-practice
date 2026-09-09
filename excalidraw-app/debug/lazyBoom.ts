/**
 * Живёт в отдельном ленивом чанке. Нужен, чтобы проверить, что source maps
 * подхватываются не только для главного бандла, но и для динамически
 * подгружаемых кусков — на практике именно здесь чаще всего и обнаруживается,
 * что залилась только часть карт.
 */
export const boomInsideLazyChunk = () => {
  const payload = { chunk: "lazyBoom", loadedAt: Date.now() };
  throw new Error(
    `SENTRY LAB: error inside a lazily loaded chunk (${JSON.stringify(
      payload,
    )})`,
  );
};
