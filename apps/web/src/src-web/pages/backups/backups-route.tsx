import {lazy,Suspense} from "react";
import {Route} from "react-router-dom";
const Page=lazy(()=>import("./BackupsPage"));
const element=<Suspense fallback={<p role="status">Chargement des sauvegardes…</p>}><Page/></Suspense>;
export const backupsRoute={path:"backups",element};
export const backupsRouteElement=<Route path="backups" element={element}/>;
