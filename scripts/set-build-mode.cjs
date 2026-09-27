const fs=require("node:fs");
const path=require("node:path");
const mode=(process.argv[2]||"full").toLowerCase();
if(!["full","demo"].includes(mode)) throw new Error("Usage: node scripts/set-build-mode.cjs <full|demo>");
const dir=path.join(process.cwd(),"electron","config");
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,"distribution.ts"),"export const DEMO_BUILD = "+(mode==="demo"?"true":"false")+" as const;\n");
console.log("OLYR distribution mode:",mode);
