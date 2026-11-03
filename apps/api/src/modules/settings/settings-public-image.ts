import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { realpath, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRINT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],
  ["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],
  ["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],
  ["224.0.0.0",4],["240.0.0.0",4],
] as const) blocked.addSubnet(address,prefix,"ipv4");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::",3,"ipv6");
for (const [address,prefix] of [["2001::",23],["2001:db8::",32],["2002::",16],["3ffe::",16],["3fff::",20]] as const) blocked.addSubnet(address,prefix,"ipv6");

export function isPublicImageAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address,"ipv4")
    : family === 6 && globalV6.check(address,"ipv6") && !blocked.check(address,"ipv6");
}
export function parsePublicImageUrl(value: string): URL {
  let url: URL; try { url = new URL(value); } catch { throw new Error("URL"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("URL");
  const host = url.hostname.replace(/^\[|\]$/g,"");
  if (isIP(host) && !isPublicImageAddress(host)) throw new Error("PRIVATE_ADDRESS");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("PRIVATE_ADDRESS");
  url.hash = ""; return url;
}

/** Resolve once, reject private/mixed results, and pin the socket to the checked IP. */
export async function readPublicHttpsImage(value: string): Promise<Buffer> {
  const url = parsePublicImageUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g,"");
  const signal = AbortSignal.timeout(10_000);
  let onAbort: (() => void) | undefined;
  let addresses: LookupAddress[];
  try {
    addresses = await Promise.race([
      lookup(hostname,{ all:true, verbatim:true }),
      new Promise<never>((_,reject)=>{ onAbort=()=>reject(new Error("NETWORK"));signal.addEventListener("abort",onAbort,{once:true}); }),
    ]);
  } finally { if(onAbort) signal.removeEventListener("abort",onAbort); }
  signal.throwIfAborted();
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(entry=>!isPublicImageAddress(entry.address))) throw new Error("PRIVATE_ADDRESS");
  const selected = addresses.find(entry=>entry.family===4) ?? addresses[0]!;
  const pinned: LookupFunction = (_host,options,callback) => {
    if (typeof options === "object" && options.all) callback(null,[selected]);
    else callback(null,selected.address,selected.family);
  };
  return new Promise<Buffer>((resolve,reject)=>{
    const req=request(url,{method:"GET",lookup:pinned,...{autoSelectFamily:false},signal,
      headers:{Accept:"image/png,image/jpeg;q=0.9", "User-Agent":"RH-Print-Image/1"}},response=>{
      if (response.statusCode !== 200) { response.destroy();reject(new Error(response.statusCode===404?"MISSING":response.statusCode && response.statusCode>=300 && response.statusCode<400?"REDIRECT":"NETWORK"));return; }
      if (Number(response.headers["content-length"]||0)>PRINT_IMAGE_MAX_BYTES) { response.destroy();reject(new Error("SIZE"));return; }
      let size=0;const chunks:Buffer[]=[];
      response.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>PRINT_IMAGE_MAX_BYTES){response.destroy();reject(new Error("SIZE"));}else chunks.push(Buffer.from(chunk));});
      response.on("end",()=>resolve(Buffer.concat(chunks)));
      response.on("error",reject);response.on("aborted",()=>reject(new Error("NETWORK")));
    });
    req.on("error",reject);req.end();
  });
}

function contained(root:string,target:string):boolean {
  const relative=path.relative(root,target);return relative!=="" && !relative.startsWith(`..${path.sep}`) && relative!==".." && !path.isAbsolute(relative);
}
/** Local URLs map only to public assets, never storage/private or arbitrary files. */
export async function readLocalPublicImage(value:string):Promise<Buffer> {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) throw new Error("URL");
  let pathname:string;
  try { pathname=decodeURIComponent(value.split(/[?#]/,1)[0]!); } catch { throw new Error("URL"); }
  if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").includes("..")) throw new Error("URL");
  const roots=[process.env.PAYROLL_PUBLIC_ASSETS_DIR,
    fileURLToPath(new URL("../../../../web/public/",import.meta.url)),
    fileURLToPath(new URL("../../../public/",import.meta.url))].filter((v):v is string=>Boolean(v));
  for(const configured of roots){
    let root:string;try{root=await realpath(configured);}catch{continue;}
    const candidate=path.resolve(root,`.${pathname}`);
    if(!contained(root,candidate))throw new Error("URL");
    let resolved:string;try{resolved=await realpath(candidate);}catch{continue;}
    if(!contained(root,resolved))throw new Error("URL");
    const file=await open(resolved,"r");
    try{
      const stat=await file.stat();if(!stat.isFile())throw new Error("URL");
      if(stat.size>PRINT_IMAGE_MAX_BYTES)throw new Error("SIZE");
      const bytes=Buffer.alloc(PRINT_IMAGE_MAX_BYTES+1);let size=0;
      while(size<bytes.length){const result=await file.read(bytes,size,bytes.length-size,null);if(!result.bytesRead)break;size+=result.bytesRead;}
      if(size>PRINT_IMAGE_MAX_BYTES)throw new Error("SIZE");return bytes.subarray(0,size);
    }finally{await file.close();}
  }
  throw new Error("LOCAL_MISSING");
}
