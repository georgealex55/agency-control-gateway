export type SocialState="draft"|"planned"|"approved";
export type SocialChannel="instagram"|"facebook"|"linkedin"|"threads"|"tiktok"|"youtube"|"x"|"pinterest";
export const SOCIAL_CHANNELS=["instagram","facebook","linkedin","threads","tiktok","youtube","x","pinterest"] as const;
export const SOCIAL_STATES=["draft","planned","approved"] as const;
export type SocialInput={content:string;state:SocialState;channels:SocialChannel[];scheduledAt:string|null};
export function validId(v:unknown):v is string{return typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
export function parseSocialInput(v:unknown,now=Date.now()):SocialInput{
  if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("Invalid social content payload");
  const o=v as Record<string,unknown>;
  if(typeof o.content!=="string"||o.content.trim().length<1||o.content.length>3000)throw new Error("Content must be between 1 and 3000 characters");
  if(o.state!=="draft"&&o.state!=="planned"&&o.state!=="approved")throw new Error("Invalid content state");
  if(!Array.isArray(o.channels)||o.channels.length>8||!o.channels.every(c=>SOCIAL_CHANNELS.some(k=>k===c))||new Set(o.channels).size!==o.channels.length)throw new Error("Invalid channels");
  const scheduledAt=o.scheduledAt===null||o.scheduledAt===undefined||o.scheduledAt===""?null:o.scheduledAt;
  if(scheduledAt!==null&&(typeof scheduledAt!=="string"||!(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(scheduledAt))||!Number.isFinite(Date.parse(scheduledAt))))throw new Error("Invalid UTC schedule");
  if(o.state!=="draft"){
    if(scheduledAt===null||Date.parse(scheduledAt)<now+15*60*1000)throw new Error("Planned content must be scheduled at least 15 minutes ahead");
    if(o.channels.length===0)throw new Error("Select a channel to plan content");
  }
  return {content:o.content.trim(),state:o.state,channels:o.channels as SocialChannel[],scheduledAt};
}
export function stageEnabled(env:Record<string,string|undefined>):boolean{
  return env.VERCEL_ENV==="preview" && env.VERCEL_GIT_COMMIT_REF==="feature/social-vercel-native-stage-20261029" && env.SOCIAL_STAGING_ENABLED==="true";
}
export function socialReadiness(env:Record<string,string|undefined>){
 return {mode:"staging",publishingEnabled:false,connected:false,requiresPostiz:false,workspaceIsolation:true,scanEnabled:false,ghlImportEnabled:false};
}
