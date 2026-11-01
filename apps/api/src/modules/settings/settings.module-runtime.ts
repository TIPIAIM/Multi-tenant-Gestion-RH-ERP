import type {Types} from "mongoose";
import {AppError} from "../../core/errors/app-error.js";
import {resolveTenantSettings} from "./settings.resolver.js";
import {buildDefaultTenantSettings} from "./settings.defaults.js";
export async function getPublishedModuleSettings(tenantId:Types.ObjectId){return await resolveTenantSettings({tenantId})??buildDefaultTenantSettings();}
export async function assertPublishedModuleEnabled(tenantId:Types.ObjectId,feature:"training"|"recruitment"){
 const settings=await getPublishedModuleSettings(tenantId);
 if(!settings.featureFlags[feature])throw new AppError(feature==="training"?"Le module Formation est désactivé pour votre organisation.":"Le module Recrutement est désactivé pour votre organisation.",403,"MODULE_DISABLED");
 return settings;
}
