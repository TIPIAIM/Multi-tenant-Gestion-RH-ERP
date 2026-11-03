import { AppError } from "../../core/errors/app-error.js";
import type { BrandingSettings } from "./settings.types.js";
import { parsePublicImageUrl, readLocalPublicImage, readPublicHttpsImage } from "./settings-public-image.js";

const cache=new Map<string,{bytes:Buffer;until:number}>();
const pending=new Map<string,Promise<Buffer>>();
function printable(bytes:Buffer):boolean{
  return (bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (bytes.length>=4 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff);
}
function pngVersion(value:string):string|null{
  const next=parsePublicImageUrl(value);
  if(next.hostname!=="res.cloudinary.com" || !/^\/[^/]+\/image\/upload\//.test(next.pathname))return null;
  if(/\/v\d+\//.test(next.pathname))next.pathname=next.pathname.replace(/\/v(\d+)\//,"/f_png/v$1/");
  else if(next.pathname.includes("/rh-platform/tenants/"))next.pathname=next.pathname.replace("/rh-platform/tenants/","/f_png/rh-platform/tenants/");
  else return null;
  return next.href;
}
async function readPrintable(value:string):Promise<Buffer>{
  const local=value.startsWith("/");
  const bytes=local?await readLocalPublicImage(value):await readPublicHttpsImage(value);
  if(printable(bytes))return bytes;
  const converted=local?null:pngVersion(value);
  if(converted){const png=await readPublicHttpsImage(converted);if(printable(png))return png;}
  throw new Error("FORMAT");
}
async function cached(value:string):Promise<Buffer>{
  const key=value.startsWith("/")?`${process.env.PAYROLL_PUBLIC_ASSETS_DIR??""}:${value}`:value;
  const known=cache.get(key);if(known && known.until>Date.now())return known.bytes;
  cache.delete(key);const running=pending.get(key);if(running)return running;
  const request=readPrintable(value);pending.set(key,request);
  try{const bytes=await request;if(cache.size>=12)cache.delete(cache.keys().next().value!);cache.set(key,{bytes,until:Date.now()+60_000});return bytes;}
  finally{pending.delete(key);}
}
/** Reads only published logo references: no draft publication or mark configuration is required. */
export async function loadPayslipLogo(settings:{branding:BrandingSettings}):Promise<Buffer|undefined>{
  const candidates=[...new Set([settings.branding.printLogoUrl,settings.branding.logoUrl].map(value=>value?.trim()).filter((value):value is string=>Boolean(value)))];
  if(!candidates.length)return undefined;
  const reasons:string[]=[];
  for(const value of candidates){try{return await cached(value);}catch(error){reasons.push(error instanceof Error?error.message:"NETWORK");}}
  const reason=reasons.find(value=>value==="LOCAL_MISSING")??reasons.at(-1)??"NETWORK";
  const help:Record<string,string>={
    URL:"Le logo publié doit utiliser une URL HTTPS valide ou un chemin public /… . Corrigez cette référence dans Configuration puis publiez.",
    PRIVATE_ADDRESS:"L’adresse du logo vise une machine locale ou un réseau privé. Utilisez un chemin public /… pour un logo local, ou importez le logo dans Configuration puis publiez.",
    LOCAL_MISSING:"Le logo local publié est introuvable sur le serveur. Rendez son dossier public accessible à l’API via PAYROLL_PUBLIC_ASSETS_DIR, ou importez le logo dans Configuration puis publiez.",
    MISSING:"Le fichier du logo publié est introuvable. Importez à nouveau le logo dans Configuration puis publiez.",
    REDIRECT:"L’adresse publiée du logo redirige vers une autre adresse. Utilisez l’URL HTTPS directe de l’image dans Configuration puis publiez.",
    SIZE:"Le logo publié dépasse 2 Mo. Réduisez sa taille puis importez-le dans Configuration.",
    FORMAT:"Le logo publié ne peut pas être imprimé. Utilisez un logo PNG ou JPEG ; une image WebP peut être importée dans Configuration pour être convertie en PNG.",
  };
  throw new AppError(help[reason]??"Le serveur ne peut pas charger le logo publié. Réessayez ; si le problème persiste, faites vérifier son accès réseau par l’administrateur.",503,"PAYROLL_LOGO_UNAVAILABLE");
}
