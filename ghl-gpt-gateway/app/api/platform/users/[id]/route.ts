import {NextRequest} from "next/server";
import {adminAuthenticated,sameOrigin} from "@/lib/portal-auth";
import {reply} from "@/lib/social-api";
import {changeReservedSeat,classifySeatError} from "@/lib/platform-user-seats";
import {validSeatId} from "@/lib/user-seats-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(!adminAuthenticated(req))return reply({error:"Administrator sign-in required"},401);
 const {id}=await params;if(!validSeatId(id))return reply({error:"Invalid user seat ID"},400);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid request"},400);}
 const input=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!input||!(input.action==="disable"||input.action==="reserve"))return reply({error:"Invalid seat action"},400);
 try{
  const user=await changeReservedSeat(id,input.action==="disable");
  return user?reply({user,individualLoginEnabled:false,invitationSent:false}):reply({error:"Reservation not found or seat cannot be changed"},404);
 }catch(err){const failure=classifySeatError(err);return reply({error:failure.error},failure.code);}
}
