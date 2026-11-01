import {Router,type Request,type Response,type NextFunction} from "express";
import multer from "multer";
import {z} from "zod";
import {requireAuth} from "../../middlewares/auth.middleware.js";
import {tenantContextMiddleware} from "../../middlewares/tenant-context.middleware.js";
import {UserModel} from "../users/user.model.js";
import {AppError} from "../../core/errors/app-error.js";
import {env} from "../../config/env.js";
import {MAX_FILE_BYTES,groups} from "./backup.rules.js";
import * as service from "./backup.service.js";
export const backupRouter=Router();
backupRouter.use(requireAuth,tenantContextMiddleware);
const actors=new WeakMap<Request,service.BackupActor>();
backupRouter.use((req,res,next)=>{void(async()=>{if(!req.auth||!req.tenant)throw new AppError("Authentification requise.",401,"BACKUP_AUTH_REQUIRED");const user=await UserModel.findOne({_id:req.auth.userId,tenantId:req.tenant._id,isActive:true}).select("_id role fullName").lean().exec();if(user?.role!=="TENANT_ADMIN")throw new AppError("Cet espace est réservé à l’administrateur.",403,"BACKUP_FORBIDDEN");const origin=req.get("origin");if(!["GET","HEAD","OPTIONS"].includes(req.method)&&origin&&origin!==new URL(env.webUrl).origin)throw new AppError("Origine de la requête non autorisée.",403,"BACKUP_ORIGIN_FORBIDDEN");res.setHeader("Cache-Control","no-store");actors.set(req,{tenantId:req.tenant._id,userId:user._id,fullName:user.fullName,role:user.role});next();})().catch(next);});
const id=z.string().regex(/^[a-f\d]{24}$/i,"Sauvegarde invalide.");
const label=z.string().trim().max(120).default("");
const selection=z.object({label,modules:z.array(z.enum(groups.map(g=>g.key) as [typeof groups[number]["key"],...Array<typeof groups[number]["key"]>])).min(1).max(groups.length)});
function handle(work:(a:service.BackupActor,r:Request,s:Response)=>Promise<unknown>){return(r:Request,s:Response,next:NextFunction)=>{void(async()=>{const data=await work(actors.get(r)!,r,s);if(!s.headersSent)s.json({success:true,data});})().catch(next);};}
backupRouter.get("/",handle((a,r)=>service.list(a,z.coerce.number().int().min(1).max(100000).default(1).parse(r.query.page))));
backupRouter.post("/",handle((a,r)=>{const body=selection.parse(r.body);return service.create(a,body.modules,body.label);}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_FILE_BYTES,files:1,fields:1}}).single("file");
backupRouter.post("/import",(r,s,n)=>upload(r,s,e=>{if(e)n(new AppError("Choisissez un fichier de sauvegarde de 25 Mo maximum.",400,"BACKUP_UPLOAD_INVALID"));else n();}),handle((a,r)=>{if(!r.file)throw new AppError("Choisissez une sauvegarde.",400,"BACKUP_FILE_REQUIRED");return service.importFile(a,r.file.buffer,label.parse(r.body?.label));}));
backupRouter.post("/:id/preview",handle((a,r)=>service.preview(a,id.parse(r.params.id),z.object({modules:z.array(z.string().max(40)).max(13).optional()}).parse(r.body??{}).modules)));
backupRouter.post("/:id/restore",handle((a,r)=>{const body=z.object({token:z.string().regex(/^[a-f\d]{64}$/i),confirmation:z.literal("RESTAURER")}).parse(r.body);return service.restore(a,id.parse(r.params.id),body.token,body.confirmation);}));
backupRouter.get("/:id/download",handle(async(a,r,s)=>{const result=await service.download(a,id.parse(r.params.id));s.type("application/octet-stream").setHeader("Content-Disposition",`attachment; filename="${result.name}"`);s.send(result.buffer);}));

backupRouter.delete("/:id",handle((a,r)=>service.remove(a,id.parse(r.params.id))));
