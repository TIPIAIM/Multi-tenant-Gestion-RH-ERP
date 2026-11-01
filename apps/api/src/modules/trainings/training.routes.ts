import {assertPublishedModuleEnabled} from "../settings/settings.module-runtime.js";
import {trainingPopups} from "./training-notifications.js";
import {Router,type Request,type Response,type NextFunction} from "express";
import {requireAuth} from "../../middlewares/auth.middleware.js";
import {tenantContextMiddleware} from "../../middlewares/tenant-context.middleware.js";
import {AppError} from "../../core/errors/app-error.js";
import {resolveTrainingActor,type TrainingActor} from "./training.access.js";
import * as schemas from "./training.schema.js";
import * as service from "./training.service.js";
import {csvCell} from "./training.export.js";
export const trainingRouter=Router();
trainingRouter.use(requireAuth,tenantContextMiddleware);
function handle(work:(actor:TrainingActor,request:Request,response:Response)=>Promise<unknown>){return (req:Request,res:Response,next:NextFunction):void=>{
 void (async()=>{if(!req.tenant||!req.auth)throw new AppError("Authentification et locataire requis.",401,"TRAINING_AUTH_REQUIRED");const actor=await resolveTrainingActor(req.tenant._id,req.auth.userId);await assertPublishedModuleEnabled(actor.tenantId,"training");const result=await work(actor,req,res);if(!res.headersSent)res.status(200).json({success:true,data:result});})().catch(error=>{if((error as {code?:number}).code===11000)next(new AppError("Ce code de formation ou cette inscription existe déjà.",409,"TRAINING_DUPLICATE"));else next(error);});
};}
const id=(req:Request)=>schemas.idSchema.parse(req.params.id);
trainingRouter.get("/notifications/popups",handle((a,r)=>trainingPopups(a,r.query.after??"000000000000000000000000")));
trainingRouter.get("/dashboard",handle(a=>service.dashboard(a)));
trainingRouter.get("/options/agents",handle((a,r)=>service.agentOptions(a,schemas.listSchema.parse(r.query))));
trainingRouter.get("/courses",handle((a,r)=>service.listCourses(a,schemas.listSchema.parse(r.query))));
trainingRouter.post("/courses",handle((a,r)=>service.saveCourse(a,schemas.courseSchema.parse(r.body))));
trainingRouter.put("/courses/:id",handle((a,r)=>service.saveCourse(a,schemas.courseSchema.parse(r.body),id(r))));
trainingRouter.get("/sessions",handle((a,r)=>service.listSessions(a,schemas.listSchema.parse(r.query))));
trainingRouter.post("/sessions",handle((a,r)=>service.saveSession(a,schemas.sessionSchema.parse(r.body))));
trainingRouter.put("/sessions/:id",handle((a,r)=>service.saveSession(a,schemas.sessionSchema.parse(r.body),id(r))));
trainingRouter.get("/sessions/:id",handle((a,r)=>service.sessionDetails(a,id(r))));
trainingRouter.post("/sessions/:id/status",handle((a,r)=>service.transitionSession(a,id(r),schemas.transitionSchema.parse(r.body))));
trainingRouter.post("/sessions/:id/enrollments",handle((a,r)=>service.requestEnrollment(a,id(r),schemas.enrollSchema.parse(r.body).needId,schemas.enrollSchema.parse(r.body).motivation)));
trainingRouter.get("/sessions/:id/audit",handle((a,r)=>service.sessionAudit(a,id(r))));
trainingRouter.get("/enrollments",handle((a,r)=>service.listEnrollments(a,schemas.listSchema.parse(r.query))));
trainingRouter.get("/enrollments/export",handle(async(a,r,res)=>{
 const q=schemas.listSchema.parse(r.query);const first=await service.listEnrollments(a,{...q,page:1,limit:100});
 if(first.pagination.total>5000)throw new AppError("L’export est limité à 5 000 inscriptions. Affinez les filtres.",400,"TRAINING_EXPORT_LIMIT");
 const rows=[...first.items];for(let page=2;page<=first.pagination.totalPages;page++){const next=await service.listEnrollments(a,{...q,page,limit:100});rows.push(...next.items);}
 const cells=["Agent","Matricule","Formation","Statut","Confirmation organisme","Bilan externe","Référence attestation","Satisfaction / 5"];
 const lines=[cells.map(csvCell).join(";"),...rows.map(e=>[e.agentName,e.matricule,e.session?.title,e.status,e.bookingReference,e.externalOutcome,e.externalCertificateReference,e.satisfaction].map(csvCell).join(";"))];
 res.type("text/csv; charset=utf-8").setHeader("Content-Disposition",'attachment; filename="formations-inscriptions.csv"');res.send("\uFEFF"+lines.join("\r\n"));
}));
trainingRouter.post("/enrollments/:id/review",handle((a,r)=>service.reviewEnrollment(a,id(r),schemas.reviewSchema.parse(r.body))));
trainingRouter.post("/enrollments/:id/cancel",handle((a,r)=>service.cancelEnrollment(a,id(r))));
trainingRouter.put("/enrollments/:id/feedback",handle((a,r)=>service.feedback(a,id(r),schemas.feedbackSchema.parse(r.body))));

trainingRouter.get("/needs",handle((a,r)=>service.listNeeds(a,schemas.listSchema.parse(r.query))));
trainingRouter.post("/needs",handle((a,r)=>service.createNeed(a,schemas.needSchema.parse(r.body))));
trainingRouter.post("/needs/:id/review",handle((a,r)=>service.reviewNeed(a,id(r),schemas.reviewSchema.parse(r.body))));
trainingRouter.put("/needs/:id/impact",handle((a,r)=>service.evaluateImpact(a,id(r),schemas.impactSchema.parse(r.body))));
trainingRouter.get("/sources/evaluations/:id",handle((a,r)=>service.evaluationOptions(a,id(r))));
trainingRouter.post("/enrollments/:id/confirm",handle((a,r)=>service.confirmExternalEnrollment(a,id(r),schemas.confirmSchema.parse(r.body).bookingReference)));
trainingRouter.put("/enrollments/:id/external-result",handle((a,r)=>service.externalResult(a,id(r),schemas.externalResultSchema.parse(r.body))));

trainingRouter.post("/offers",handle((a,r)=>service.publishTrainingOffer(a,schemas.offerSchema.parse(r.body))));
