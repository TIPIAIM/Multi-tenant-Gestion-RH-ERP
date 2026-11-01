import {RecruitmentJobModel,RecruitmentApplicationModel,RecruitmentInterviewModel,RecruitmentEventModel,RecruitmentNoticeModel} from "./recruitment.model.js";
export async function ensureRecruitmentIndexes():Promise<void>{
 for(const model of [RecruitmentJobModel,RecruitmentApplicationModel,RecruitmentInterviewModel,RecruitmentEventModel,RecruitmentNoticeModel])await model.createIndexes();
}
