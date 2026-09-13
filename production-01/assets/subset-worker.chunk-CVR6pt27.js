
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="50f62354-8222-5786-8fdb-467f6b0e8dc9")}catch(e){}}();
import{Commands as t,subsetToBinary as o}from"./subset-shared.chunk-D3ioWSie.js";const r=import.meta.url?new URL(import.meta.url):void 0;typeof window>"u"&&typeof self<"u"&&(self.onmessage=async e=>{switch(e.data.command){case t.Subset:const a=await o(e.data.arrayBuffer,e.data.codePoints);self.postMessage(a,{transfer:[a]});break}});export{r as WorkerUrl};

//# debugId=50f62354-8222-5786-8fdb-467f6b0e8dc9
