import {lazy,Suspense} from "react";
import {Route} from "react-router-dom";
const TrainingsPage=lazy(()=>import("./TrainingsPage"));
const element=<Suspense fallback={<p role="status">Chargement du module Formations…</p>}><TrainingsPage/></Suspense>;
/** Avec createBrowserRouter : ajouter trainingRoute dans les children du DashboardLayout. */
export const trainingRoute={path:"trainings",element};
/** Avec <Routes> : insérer {trainingRouteElement} dans la route du DashboardLayout. */
export const trainingRouteElement=<Route path="trainings" element={element}/>;
