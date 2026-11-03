import {lazy,Suspense} from "react";
import {Route} from "react-router-dom";
const RecruitmentPage=lazy(()=>import("./RecruitmentPage"));
const element=<Suspense fallback={<p role="status">Chargement du recrutement…</p>}><RecruitmentPage/></Suspense>;
export const recruitmentRoute={path:"recruitment",element};
export const recruitmentRouteElement=<Route path="recruitment" element={element}/>;
