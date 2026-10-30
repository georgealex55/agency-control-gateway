import {NextRequest} from "next/server";
import {adminAuthenticated,sameOrigin} from "@/lib/portal-auth";
import {reply} from "@/lib/social-api";
import {listUserSeats,reserveUserSeat,classifySeatError} from "@/lib/platform-user-seats";
import {normalizeSeatEmail,validUserRole,validSeatLabel} from "@/lib/user-seats-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Administrator sign-in required"},401);
 try{return reply(await listUserSeats());}
 catch{return reply({error:"Five-seat registry unavailable"},503);}
}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(!adminAuthenticated(req))return reply({error:"Administrator sign-in required"},401);
 let input:unknown;try{input=await req.json();}catch{return reply({error:"Invalid request"},400);}
 if(!input||typeof input!=="object"||Array.isArray(input))return reply({error:"Invalid request"},400);
 const value=input as Record<string,unknown>;
 const email=normalizeSeatEmail(value.email);
 if(!email||!validSeatLabel(value.name)||!validUserRole(value.role))return reply({error:"Valid email, display name and role are required"},400);
 try{return reply({user:await reserveUserSeat({email,name:value.name.trim(),role:value.role}),loginEnabled:false,invitationSent:false},201);}
 catch(err){const failure=classifySeatError(err);return reply({error:failure.error},failure.code);}
}
