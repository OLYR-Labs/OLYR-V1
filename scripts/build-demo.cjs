const {spawnSync}=require("node:child_process");
const fs=require("node:fs");
const path=require("node:path");
const config=path.join(process.cwd(),"electron","config","distribution.ts");
const npm=process.platform==="win32"?"npm.cmd":"npm";
const write=(demo)=>{fs.mkdirSync(path.dirname(config),{recursive:true});fs.writeFileSync(config,"export const DEMO_BUILD = "+(demo?"true":"false")+" as const;\n");};
write(true);
let code=1;
try { const r=spawnSync(npm,["run","build"],{stdio:"inherit"}); code=typeof r.status==="number"?r.status:1; }
finally { write(false); }
process.exit(code);
