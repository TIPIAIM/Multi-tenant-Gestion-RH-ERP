import mongoose,{type Model} from "mongoose";
import {createHash} from "node:crypto";
import {eligibleModel,groups,expandGroups,type BackupGroup} from "./backup.rules.js";
export function modelsFor(selected:string[]):Array<{group:BackupGroup;model:Model<any>}>{
 const expanded=expandGroups(selected),result:Array<{group:BackupGroup;model:Model<any>}>=[];
 for(const model of Object.values(mongoose.models)){
  if(!eligibleModel(model.modelName,!!model.schema.path("tenantId")))continue;
  const group=groups.find(g=>expanded.includes(g.key)&&g.prefixes.some(p=>model.modelName.startsWith(p)));
  if(group)result.push({group:group.key,model});
 }
 return result.sort((a,b)=>a.model.modelName.localeCompare(b.model.modelName));
}
export function schemaFingerprint(model:Model<any>):string{
 const fields=Object.entries(model.schema.paths).map(([name,path])=>[name,path.instance,String(path.options.ref??""),Boolean(path.options.required)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
 return createHash("sha256").update(JSON.stringify([model.modelName,model.collection.collectionName,fields])).digest("hex");
}
export function catalog(){const all=modelsFor(groups.map(g=>g.key));return groups.map(g=>({key:g.key,label:g.label,available:all.some(m=>m.group===g.key),dependencies:g.dependencies}));}
