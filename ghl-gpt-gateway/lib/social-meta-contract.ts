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
 return Boolean(id&&secret&&env.SOCIAL_META_OAUTH_STATE_SECRET&&env.SOCIAL_META_TOKEN_KEY&&validGraphVersion(env.SOCIAL_META_GRAPH_VERSION)&&validMetaRedirect(env.SOCIAL_META_REDIRECT_URI));
}
