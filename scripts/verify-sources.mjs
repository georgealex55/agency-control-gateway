import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root=resolve(import.meta.dirname,"..");
const lock=JSON.parse(readFileSync(resolve(root,"services/UPSTREAM_LOCK.json"),"utf8"));
const gitmodules=readFileSync(resolve(root,".gitmodules"),"utf8");
let failed=0;
for(const entry of lock.services){
  const path=resolve(root,entry.path);
  if(!gitmodules.includes("path = "+entry.path)){console.error("MISSING .gitmodules:",entry.id);failed++;continue;}
  if(!existsSync(path)||!statSync(path).isDirectory()||!existsSync(resolve(path,"README.md"))){
    console.warn("NOT CHECKED OUT:",entry.path,"Run: git submodule update --init --recursive");
    continue;
  }
  let actual;
  try{actual=execFileSync("git",["-C",path,"rev-parse","HEAD"],{encoding:"utf8"}).trim();}
  catch{console.error("INVALID CHECKOUT:",entry.path);failed++;continue;}
  if(actual!==entry.commit){console.error("PIN MISMATCH:",entry.id,actual,entry.commit);failed++;}
  else console.log("OK",entry.id,actual.slice(0,12));
}
if(failed)process.exitCode=1;
