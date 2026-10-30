export type MetaProvider="facebook_pages"|"instagram_professional";
export const META_PROVIDERS=["facebook_pages","instagram_professional"] as const;
export const META_READ_PERMISSIONS={
 facebook_pages:["pages_show_list","pages_read_engagement"],
 instagram_professional:["instagram_business_basic"]
} as const;
export function isMetaProvider(value:unknown):value is MetaProvider{
 return META_PROVIDERS.some(x=>x===value);
}
export function validGraphVersion(value:unknown):value is string{
 return typeof value==="string"&&/^v[0-9]{1,2}\.[0-9]{1,2}$/.test(value);
}
export function validMetaRedirect(value:unknown):value is string{
 if(typeof value!=="string")return false;
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==="/api/platform/social/meta/callback";}catch{return false;}
}
export function buildMetaAuthorizeURL(input:{provider:MetaProvider;clientId:string;redirectUri:string;state:string;graphVersion:string}):string{
 if(!/^[0-9]{6,32}$/.test(input.clientId)||!validMetaRedirect(input.redirectUri)||!validGraphVersion(input.graphVersion)||!/^[-_A-Za-z0-9.]{30,700}$/.test(input.state))throw Error("Invalid Meta OAuth parameters");
 const facebook=input.provider==="facebook_pages";
 const u=new URL(facebook?"https://www.facebook.com/"+input.graphVersion+"/dialog/oauth":"https://www.instagram.com/oauth/authorize");
 u.searchParams.set("client_id",input.clientId);
 u.searchParams.set("redirect_uri",input.redirectUri);
 u.searchParams.set("state",input.state);
 u.searchParams.set("response_type","code");
 u.searchParams.set("scope",META_READ_PERMISSIONS[input.provider].join(","));
 if(!facebook)u.searchParams.set("enable_fb_login","0");
 return u.href;
}
export function metaConfigured(env:Record<string,string|undefined>,provider:MetaProvider):boolean{
 const id=provider==="facebook_pages"?env.SOCIAL_META_FACEBOOK_CLIENT_ID:env.SOCIAL_META_INSTAGRAM_CLIENT_ID;
 const secret=provider==="facebook_pages"?env.SOCIAL_META_FACEBOOK_CLIENT_SECRET:env.SOCIAL_META_INSTAGRAM_CLIENT_SECRET;
 return Boolean(
   typeof id==="string"&&/^[0-9]{6,32}$/.test(id)&&
   typeof secret==="string"&&secret.length>=8&&secret.length<=1024&&
   typeof env.SOCIAL_META_OAUTH_STATE_SECRET==="string"&&env.SOCIAL_META_OAUTH_STATE_SECRET.length>=32&&
   typeof env.SOCIAL_META_TOKEN_KEY==="string"&&/^[A-Za-z0-9_-]{43}$/.test(env.SOCIAL_META_TOKEN_KEY)&&
   validGraphVersion(env.SOCIAL_META_GRAPH_VERSION)&&validMetaRedirect(env.SOCIAL_META_REDIRECT_URI)
  );
}

/**
 * Admin-visible Meta setup inventory: only safe variable NAMES and the public
 * callback address. NEVER return app secrets, encryption keys or access tokens.
 */
export function metaSetupStatus(env:Record<string,string|undefined>,provider:MetaProvider,requestOrigin:string){
 const prefix=provider==="facebook_pages"?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM";
 const idKey=prefix+"_CLIENT_ID",secretKey=prefix+"_CLIENT_SECRET";
 const missing:string[]=[];
 if(!/^[0-9]{6,32}$/.test(env[idKey]||""))missing.push(idKey);
 if((env[secretKey]||"").length<8)missing.push(secretKey);
 if(!validGraphVersion(env.SOCIAL_META_GRAPH_VERSION))missing.push("SOCIAL_META_GRAPH_VERSION");
 if((env.SOCIAL_META_OAUTH_STATE_SECRET||"").length<32)missing.push("SOCIAL_META_OAUTH_STATE_SECRET");
 if(!/^[A-Za-z0-9_-]{43}$/.test(env.SOCIAL_META_TOKEN_KEY||""))missing.push("SOCIAL_META_TOKEN_KEY");
 if(!validMetaRedirect(env.SOCIAL_META_REDIRECT_URI))missing.push("SOCIAL_META_REDIRECT_URI");
 const callbackUrl=validMetaRedirect(env.SOCIAL_META_REDIRECT_URI)?env.SOCIAL_META_REDIRECT_URI!:null;
 const callbackOrigin=callbackUrl?new URL(callbackUrl).origin:null;
 const stageBranch=env.VERCEL_BRANCH_URL?.trim();
 const branchMatches=Boolean(callbackUrl&&(!stageBranch||new URL(callbackUrl).hostname===stageBranch));
 const isCanonicalHost=Boolean(callbackOrigin&&requestOrigin===callbackOrigin);
 const featureEnabled=env.SOCIAL_META_CONNECTIONS_ENABLED==="true";
 return {
  provider,
  missingSettings:missing,
  appConfigured:missing.length===0,
  permissions:[...META_READ_PERMISSIONS[provider]],
  accessType:"read_only" as const,
  callbackUrl,
  isCanonicalHost,
  branchMatches,
  featureEnabled,
  launchEnabled:featureEnabled&&missing.length===0&&branchMatches&&isCanonicalHost
 };
}
