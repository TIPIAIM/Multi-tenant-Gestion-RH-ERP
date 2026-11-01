import {Types} from "mongoose";
import {AppError} from "../../core/errors/app-error.js";
import {UserModel} from "../users/user.model.js";
import {isRecruitmentManager} from "./recruitment.rules.js";
export type RecruitmentActor={tenantId:Types.ObjectId;userId:Types.ObjectId;fullName:string;role:"TENANT_ADMIN"|"RH_MANAGER"};
export async function resolveRecruitmentActor(tenantId:Types.ObjectId,userId:string):Promise<RecruitmentActor>{
 const user=await UserModel.findOne({_id:userId,tenantId,isActive:true}).select("_id fullName role").lean().exec();
 if(!user||!isRecruitmentManager(user.role))throw new AppError("Le recrutement est réservé aux RH et à l’administrateur.",403,"RECRUITMENT_FORBIDDEN");
 return {tenantId,userId:user._id,fullName:user.fullName,role:user.role as RecruitmentActor["role"]};
}
