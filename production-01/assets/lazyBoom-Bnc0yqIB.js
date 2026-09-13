
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="8271bd3c-02b6-5072-ac81-ee9522d2ff18")}catch(e){}}();
const n=()=>{const o={chunk:"lazyBoom",loadedAt:Date.now()};throw new Error(`SENTRY LAB: error inside a lazily loaded chunk (${JSON.stringify(o)})`)};export{n as boomInsideLazyChunk};

//# debugId=8271bd3c-02b6-5072-ac81-ee9522d2ff18
