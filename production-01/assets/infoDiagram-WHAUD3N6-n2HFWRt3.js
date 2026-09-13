
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="9f376304-9d73-5e45-b22e-1b3d990cc68e")}catch(e){}}();
import{_ as e,l as s,K as n,e as i,L as p}from"./mermaid-to-excalidraw-DKpF4Sfr.js";import{p as g}from"./treemap-KMMF4GRG-Dnxkh6zy.js";import"./_baseUniq-CSiMfBov.js";import"./_basePickBy--CrqrvYQ.js";import"./clone-BepOXxo9.js";var v={parse:e(async r=>{const a=await g("info",r);s.debug(a)},"parse")},d={version:p.version+""},m=e(()=>d.version,"getVersion"),c={getVersion:m},l=e((r,a,o)=>{s.debug(`rendering info diagram
`+r);const t=n(a);i(t,100,400,!0),t.append("g").append("text").attr("x",100).attr("y",40).attr("class","version").attr("font-size",32).style("text-anchor","middle").text(`v${o}`)},"draw"),f={draw:l},S={parser:v,db:c,renderer:f};export{S as diagram};

//# debugId=9f376304-9d73-5e45-b22e-1b3d990cc68e
