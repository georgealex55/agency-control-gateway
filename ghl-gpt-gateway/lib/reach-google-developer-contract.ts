import {GOOGLE_CALLBACK} from "./reach-google-contract";
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function validateGoogleDeveloper(input:unknown){
 const v=obj(input);
 const projectId=typeof v.projectId==="string"?v.projectId.trim():"";
 const clientId=typeof v.clientId==="string"?v.clientId.trim():"";
 const clientSecret=typeof v.clientSecret==="string"?v.clientSecret.trim():"";
 if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId))throw Error("Enter the Google Cloud project ID.");
 if(!/^[A-Za-z0-9_-]{10,200}\.apps\.googleusercontent\.com$/.test(clientId))throw Error("Enter the Web OAuth client ID.");
 if(!/^[A-Za-z0-9_-]{8,256}$/.test(clientSecret))throw Error("Enter the Web OAuth client secret.");
 return {projectId,clientId,clientSecret};
}
export function parseGoogleWebClient(raw:string){
 if(typeof raw!=="string"||raw.length>32768)throw Error("Invalid Google Web OAuth JSON.");
 const root=obj(JSON.parse(raw)),w=obj(root.web);
 if(!Object.keys(w).length||root.installed||root.type==="service_account")throw Error("Download a Web application OAuth client JSON, not a service account or Desktop client.");
 if(!Array.isArray(w.redirect_uris)||!w.redirect_uris.includes(GOOGLE_CALLBACK))throw Error("Add the exact REACH callback in Google Cloud, then download the updated client JSON.");
 return validateGoogleDeveloper({projectId:w.project_id,clientId:w.client_id,clientSecret:w.client_secret});
}
