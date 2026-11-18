import { NextRequest, NextResponse } from "next/server";
import { getPersonalRecords, savePersonalRecord, RECORD_KINDS, type RecordKind } from "@/lib/connections/fieldclock-db";
import { verifyPersonalNeonOwner } from "@/lib/connections/neon-owner-auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function owner(req:NextRequest){
  return verifyPersonalNeonOwner(req.headers.get("authorization"));
}
export async function GET(req:NextRequest) {
  if(!await owner(req))return json({error:"Secure Neon Auth owner login required"},401);
  try{return json({records:await getPersonalRecords()});}
  catch{return json({error:"Staging storage temporarily unavailable"},503);}
}
export async function POST(req:NextRequest) {
  if(req.headers.get("origin")!==req.nextUrl.origin)return json({error:"Origin verification failed"},403);
  if(!await owner(req))return json({error:"Secure Neon Auth owner login required"},401);
  let data:Record<string,unknown>;
  try{
    const parsed=await req.json();
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Invalid body");
    data=parsed as Record<string,unknown>;
  }catch{return json({error:"Invalid JSON body"},400);}
  // A record write is a deliberate owner-approved local storage operation;
  // outbound calls, social posting, mail, automation and dispatch are not available.
  if(data.approved!==true)return json({error:"Explicit save approval required"},403);
  if(typeof data.kind!=="string"||!RECORD_KINDS.includes(data.kind as RecordKind))return json({error:"Unsupported record type"},400);
  const kind=data.kind as RecordKind;
  const title=typeof data.title==="string"?data.title.trim():"";
  const notes=typeof data.notes==="string"?data.notes.trim():"";
  const requestId=typeof data.requestId==="string"?data.requestId:"";
  if(!title||title.length>160||notes.length>4000||!(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i).test(requestId))
    return json({error:"Invalid record content or request identifier"},400);
  try{
    const record=await savePersonalRecord({kind,title,notes,requestId});
    return json({record,duplicate:record===null},record?201:200);
  }catch{return json({error:"Record could not be saved"},503);}
}
