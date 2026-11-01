import {createCipheriv,createDecipheriv,randomBytes,createHash} from "node:crypto";
import {gzip,gunzip} from "node:zlib";
import {promisify} from "node:util";
import {MAX_BYTES,MAX_FILE_BYTES} from "./backup.rules.js";
const compress=promisify(gzip),decompress=promisify(gunzip),magic=Buffer.from("FADES-RH-BACKUP-1\n");
export function encryptionKey():Buffer{
 const raw=(process.env.RH_BACKUP_ENCRYPTION_KEY??"").trim();
 if(!/^[a-f\d]{64}$/i.test(raw)&&!/^[A-Za-z0-9+/]{43}=$/.test(raw))throw new Error("Le chiffrement des sauvegardes doit être configuré avant utilisation.");
 const key=/^[a-f\d]{64}$/i.test(raw)?Buffer.from(raw,"hex"):Buffer.from(raw,"base64");
 if(key.length!==32)throw new Error("Le chiffrement des sauvegardes doit être configuré avant utilisation.");return key;
}
export const digest=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
export async function seal(plain:string,tenantId:string,key=encryptionKey()):Promise<Buffer>{
 if(Buffer.byteLength(plain)>MAX_BYTES)throw new Error("Cette sélection dépasse la capacité de sauvegarde de cette version. Sélectionnez moins de modules.");
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(tenantId));
 const zipped=await compress(Buffer.from(plain));const encrypted=Buffer.concat([cipher.update(zipped),cipher.final()]);return Buffer.concat([magic,iv,cipher.getAuthTag(),encrypted]);
}
export async function unseal(file:Buffer,tenantId:string,key=encryptionKey()):Promise<string>{
 if(file.length>MAX_FILE_BYTES||file.length<magic.length+29||!file.subarray(0,magic.length).equals(magic))throw new Error("Le fichier n’est pas une sauvegarde reconnue.");
 const offset=magic.length,decipher=createDecipheriv("aes-256-gcm",key,file.subarray(offset,offset+12));decipher.setAAD(Buffer.from(tenantId));decipher.setAuthTag(file.subarray(offset+12,offset+28));
 const zipped=Buffer.concat([decipher.update(file.subarray(offset+28)),decipher.final()]);const plain=await decompress(zipped,{maxOutputLength:MAX_BYTES});return plain.toString("utf8");
}
