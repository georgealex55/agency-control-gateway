/** Read-only integration readiness. No OAuth, tokens, social API calls or publishing in this milestone. */
export const SOCIAL_PROVIDER_CATALOG=[
 {id:"instagram",name:"Instagram",auth:"Instagram API with Instagram Login",accounts:"Professional Business or Creator",scopes:["instagram_business_basic"],publishScopes:["instagram_business_content_publish"],appSetup:"Meta Developer app, Instagram Business Login, App Review",supports:["feed","reels","insights"]},
 {id:"facebook",name:"Facebook Pages",auth:"Facebook Login for Business",accounts:"Managed Facebook Pages",scopes:["pages_show_list","pages_read_engagement"],publishScopes:["pages_manage_posts"],appSetup:"Meta Developer app, Facebook Login for Business, App Review",supports:["pages","feed","insights"]},
 {id:"linkedin",name:"LinkedIn",auth:"LinkedIn OAuth",accounts:"Personal or approved organization profile",scopes:[],publishScopes:[],appSetup:"LinkedIn developer application and relevant products/scopes",supports:["feed","insights"]},
 {id:"tiktok",name:"TikTok",auth:"TikTok Login Kit",accounts:"Authorized TikTok profile",scopes:[],publishScopes:[],appSetup:"TikTok developer app and Content Posting API review",supports:["video","insights"]},
 {id:"youtube",name:"YouTube",auth:"Google OAuth",accounts:"Authorized YouTube channel",scopes:[],publishScopes:[],appSetup:"Google Cloud OAuth and YouTube API approval",supports:["video","insights"]},
 {id:"x",name:"X",auth:"X OAuth",accounts:"Authorized X profile",scopes:[],publishScopes:[],appSetup:"X developer app and appropriate API access tier",supports:["posts","insights"]},
 {id:"pinterest",name:"Pinterest",auth:"Pinterest OAuth",accounts:"Authorized Pinterest account",scopes:[],publishScopes:[],appSetup:"Pinterest developer app and content API access",supports:["pins","insights"]},
 {id:"threads",name:"Threads",auth:"Threads OAuth",accounts:"Authorized Threads profile",scopes:[],publishScopes:[],appSetup:"Meta Threads app and relevant scopes",supports:["posts","insights"]}
] as const;
export type SocialProviderKey=typeof SOCIAL_PROVIDER_CATALOG[number]["id"];
export function providerReadiness(){
 return SOCIAL_PROVIDER_CATALOG.map(p=>({...p,connectionStatus:"not_connected" as const,oauthEnabled:false,publishingEnabled:false,analyticsEnabled:false}));
}
