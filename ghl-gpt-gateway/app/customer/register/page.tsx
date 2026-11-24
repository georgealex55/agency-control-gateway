"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {customerAuthClient} from "@/lib/reach-customer-neon-client";
import "@/app/connections/connections.css";
export default function CustomerRegister(){
 const [invite,setInvite]=useState("");
 const [email,setEmail]=useState("");
 const [name,setName]=useState("");
 const [password,setPassword]=useState("");
 const [otp,setOtp]=useState("");
 const [phase,setPhase]=useState<"register"|"verify"|"ready">("register");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 useEffect(()=>{const t=new URLSearchParams(window.location.search).get("invite")||"";setInvite(/^[A-Za-z0-9_-]{43}$/.test(t)?t:"");},[]);
 async function register(e:FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   if(!invite)throw Error("Valid REACH invitation required.");
   const res=await customerAuthClient.signUp.email({name:name.trim(),email:email.trim().toLowerCase(),password});
   if(res.error)throw Error("Account creation not completed. Check your address and try again.");
   setPassword("");setPhase("verify");
   setMessage("Enter the verification code sent to your email.");
  }catch(e){setMessage(e instanceof Error?e.message:"Registration unavailable");}
  finally{setBusy(false);}
 }
 async function verify(e:FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   const result=await customerAuthClient.emailOtp.verifyEmail({email:email.trim().toLowerCase(),otp:otp.trim()});
   if(result.error)throw Error("Email verification code was not accepted.");
   setPhase("ready");setMessage("Email verified. Sign in, then accept the invitation.");
  }catch(e){setMessage(e instanceof Error?e.message:"Verification not completed");}
  finally{setBusy(false);}
 }
 return <main className="reach-conn"><div className="reach-conn-wrap" style={{maxWidth:520}}>
  <nav><Link href="/">← REACH</Link></nav>
  <p className="reach-conn-eyebrow">REACH · INVITED CUSTOMER</p><h1>Verify your account</h1>
  <p>Use the exact email address on your invitation. Completing registration does not grant workspace membership by itself.</p>
  {!invite?<p role="alert" className="reach-conn-error">An invitation is required to open registration.</p>:phase==="register"?<form onSubmit={e=>void register(e)} style={{display:"grid",gap:10}}>
   <label htmlFor="reach-register-name">Full name</label><input id="reach-register-name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/>
   <label htmlFor="reach-register-email">Invited email</label><input id="reach-register-email" required type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
   <label htmlFor="reach-register-password">Password</label><input id="reach-register-password" required type="password" minLength={12} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/>
   <button disabled={busy}>{busy?"Registering…":"Create account and verify email"}</button>
  </form>:phase==="verify"?<form onSubmit={e=>void verify(e)} style={{display:"grid",gap:10}}>
   <label htmlFor="reach-register-otp">Email verification code</label>
   <input id="reach-register-otp" required inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value)}/>
   <button disabled={busy}>{busy?"Verifying…":"Verify email"}</button>
  </form>:<Link href={"/customer/sign-in?invite="+encodeURIComponent(invite)}>Continue to customer sign-in</Link>}
  {message&&<p role="status">{message}</p>}
 </div></main>;
}
