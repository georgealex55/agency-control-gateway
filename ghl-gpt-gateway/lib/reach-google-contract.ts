const google="https://www.googleapis.com/auth/";
export const GOOGLE_GROUPS=[
 {id:"ga4",label:"Analytics",scopes:[google+"analytics.readonly"],domain:true},
 {id:"search_console",label:"Search Console",scopes:[google+"webmasters.readonly"],domain:true},
 {id:"youtube",label:"YouTube",scopes:[google+"youtube.readonly",google+"yt-analytics.readonly"],domain:false},
 {id:"calendar",label:"Calendar",scopes:[google+"calendar.readonly"],domain:false},
 {id:"contacts",label:"Contacts",scopes:[google+"contacts.readonly"],domain:false},
 {id:"tag_manager",label:"Tag Manager",scopes:[google+"tagmanager.readonly"],domain:false},
] as const;
export type GoogleGroup=typeof GOOGLE_GROUPS[number]["id"];
export function groupFor(id:unknown){return GOOGLE_GROUPS.find(g=>g.id===id);}
export const IDENTITY_SCOPES=["openid",google+"userinfo.email"];
export const CALLBACK_PATH="/api/reach/google/callback";
export const GOOGLE_ORIGIN="https://agency-control-gateway.vercel.app";
export const GOOGLE_CALLBACK=GOOGLE_ORIGIN+CALLBACK_PATH;
export function googleGrant(scope:unknown,group:GoogleGroup){
 if(typeof scope!=="string"||scope.length>10000)return null;
 const scopes=[...new Set(scope.split(/\s+/).filter(Boolean))];
 const allowed=new Set<string>([...IDENTITY_SCOPES,google+"userinfo.profile",...GOOGLE_GROUPS.flatMap(g=>[...g.scopes])]);
 const required=groupFor(group);
 return required&&scopes.every(s=>allowed.has(s))&&IDENTITY_SCOPES.every(s=>scopes.includes(s))&&required.scopes.every(s=>scopes.includes(s))?scopes:null;
}
export function googleConfigured(env:NodeJS.ProcessEnv=process.env){
 return env.VERCEL_ENV==="production"&&env.REACH_GOOGLE_OAUTH_ENABLED==="true"&&/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.REACH_GOOGLE_CLIENT_ID||"")&&!!env.REACH_GOOGLE_CLIENT_SECRET&&/^[A-Za-z0-9_-]{43}$/.test(env.REACH_GOOGLE_TOKEN_KEY||"")&&Buffer.from(env.REACH_GOOGLE_TOKEN_KEY||"","base64url").length===32;
}
export function authorizeGoogle(clientId:string,group:GoogleGroup,state:string,challenge:string){
 const g=groupFor(group);if(!g)throw Error("Unknown Google group");
 const q=new URLSearchParams({client_id:clientId,redirect_uri:GOOGLE_CALLBACK,response_type:"code",scope:[...IDENTITY_SCOPES,...g.scopes].join(" "),state,code_challenge:challenge,code_challenge_method:"S256",access_type:"offline",include_granted_scopes:"true",prompt:"consent select_account"});
 return "https://accounts.google.com/o/oauth2/v2/auth?"+q.toString();
}
