import {z} from "zod";
import {trainingFormats,sessionStatuses,enrollmentStatuses} from "./training.rules.js";
const text=(max:number)=>z.string().trim().max(max);
export const idSchema=z.string().regex(/^[a-f\d]{24}$/i,"Identifiant invalide.");
export const courseSchema=z.object({code:text(40).min(2).transform(v=>v.toUpperCase()),title:text(180).min(3),category:text(100).min(2),objectives:text(4000).default(""),provider:text(180).min(2,"L’organisme externe est obligatoire."),format:z.enum(trainingFormats),durationHours:z.number().min(.5).max(2000).multipleOf(.5),active:z.boolean().default(true)});
export const sessionSchema=z.object({courseId:idSchema,startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),durationHours:z.number().min(.5).max(2000).multipleOf(.5),capacity:z.number().int().min(1).max(10000),location:text(250).default(""),trainer:text(180).default(""),totalCost:z.number().min(0).max(1e13).default(0),currency:z.enum(["GNF","EUR","USD"]).default("GNF"),}).refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),"La fin doit suivre le début.").refine(v=>Date.parse(v.endsAt)-Date.parse(v.startsAt)<=366*86400000,"La session ne peut pas dépasser un an.").refine(v=>v.durationHours<=(Date.parse(v.endsAt)-Date.parse(v.startsAt))/3600000,"Le volume de formation dépasse la durée de la session.");
export const listSchema=z.object({page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),search:text(100).optional(),status:text(30).optional(),sessionId:idSchema.optional(),needId:idSchema.optional(),mine:z.enum(["true","false"]).optional(),active:z.enum(["true","false"]).optional()});
export const transitionSchema=z.object({status:z.enum(sessionStatuses),reason:text(1200).default("")});
export const enrollSchema=z.object({needId:idSchema.optional(),motivation:text(2000).default("")});
export const reviewSchema=z.object({decision:z.enum(["APPROVED","REJECTED"]),comment:text(1200).default("")}).refine(v=>v.decision!=="REJECTED"||v.comment.length>=3,"Un motif de refus est requis.");
export const feedbackSchema=z.object({satisfaction:z.number().int().min(1).max(5),feedback:text(2000).default("")});
export type ListInput=z.infer<typeof listSchema>;
export type CourseInput=z.infer<typeof courseSchema>;
export type SessionInput=z.infer<typeof sessionSchema>;
export type TransitionInput=z.infer<typeof transitionSchema>;
export type ReviewInput=z.infer<typeof reviewSchema>;
export const validEnrollmentStatuses= enrollmentStatuses;

const httpsLink=z.string().trim().max(1000).refine(v=>!v||(()=>{try{return new URL(v).protocol==="https:";}catch{return false;}})(),"Utilisez un lien HTTPS valide.");
export const needSchema=z.object({agentId:idSchema.optional(),competency:text(180).min(3),justification:text(3000).min(10),priority:z.enum(["NORMAL","HIGH","URGENT"]),sourceKind:z.enum(["EVALUATION","REPORT","MANAGER_OBSERVATION","AGENT_REQUEST"]),sourceReference:text(300).min(3),evaluationId:idSchema.optional(),targetDate:z.iso.date()});
export const confirmSchema=z.object({bookingReference:text(300).min(2)});
export const externalResultSchema=z.object({outcome:z.enum(["ATTENDED","PARTIAL","NOT_ATTENDED"]),notes:text(2000).min(3),certificateUrl:httpsLink.default(""),certificateReference:text(300).default("")});
export const impactSchema=z.object({impact:z.enum(["IMPROVED","PARTLY_IMPROVED","NO_CHANGE"]),comment:text(2000).min(10)});
export type NeedInput=z.infer<typeof needSchema>;
export type ExternalResultInput=z.infer<typeof externalResultSchema>;

export const offerSchema=z.object({title:text(180).min(3),provider:text(180).min(2),category:text(100).default("Formation continue"),objectives:text(4000).default(""),format:z.enum(trainingFormats).default("IN_PERSON"),startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),durationHours:z.number().min(.5).max(2000).multipleOf(.5),capacity:z.number().int().min(1).max(10000),location:text(250).default(""),trainer:text(180).default(""),totalCost:z.number().min(0).max(1e13).default(0),currency:z.enum(["GNF","EUR","USD"]).default("GNF")}).refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),"La fin doit suivre le début.").refine(v=>v.durationHours<=(Date.parse(v.endsAt)-Date.parse(v.startsAt))/3600000,"Le volume dépasse la période choisie.").refine(v=>Date.parse(v.endsAt)-Date.parse(v.startsAt)<=366*86400000,"La durée maximale est un an.");
export type OfferInput=z.infer<typeof offerSchema>;
