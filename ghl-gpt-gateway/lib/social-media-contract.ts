export const MEDIA_MAX_BYTES=4*1024*1024;
export const MEDIA_MIMES=["image/jpeg","image/png","image/webp"] as const;
export type MediaMime=typeof MEDIA_MIMES[number];
export function validMime(value:unknown):value is MediaMime{return MEDIA_MIMES.some(m=>m===value);}
export function validMediaBytes(data:Uint8Array,mime:MediaMime):boolean {
 if(data.byteLength<12||data.byteLength>MEDIA_MAX_BYTES)return false;
 if(mime==="image/jpeg")return data[0]===0xff&&data[1]===0xd8&&data[2]===0xff;
 if(mime==="image/png")return [137,80,78,71,13,10,26,10].every((n,i)=>data[i]===n);
 if(mime==="image/webp")return String.fromCharCode(...data.slice(0,4))==="RIFF"&&String.fromCharCode(...data.slice(8,12))==="WEBP";
 return false;
}
export function uploadAllowed(env:Record<string,string|undefined>):boolean{
 return env.SOCIAL_MEDIA_UPLOADS_ENABLED==="true"&&Boolean(env.BLOB_READ_WRITE_TOKEN?.trim());
}
export function mediaSuffix(mime:MediaMime):string{return mime==="image/jpeg"?"jpg":mime==="image/png"?"png":"webp";}
