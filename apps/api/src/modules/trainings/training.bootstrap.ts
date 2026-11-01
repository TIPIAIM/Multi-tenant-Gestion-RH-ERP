import {TrainingNoticeModel} from "./training-notifications.js";
import {TrainingNeedModel} from "./training.need.js";
import {TrainingCourseModel,TrainingSessionModel,TrainingEnrollmentModel,TrainingAuditModel,TrainingAgentLockModel} from "./training.model.js";
/** À exécuter après connectDatabase(), avant app.listen(). */
export async function ensureTrainingIndexes():Promise<void>{
 await TrainingNoticeModel.createIndexes();
 await TrainingNeedModel.createIndexes();
 await TrainingCourseModel.createIndexes();
 await TrainingSessionModel.createIndexes();
 await TrainingEnrollmentModel.createIndexes();
 await TrainingAuditModel.createIndexes();
 await TrainingAgentLockModel.createIndexes();
}
