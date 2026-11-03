import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";
const FilesPage = lazy(() => import("./FilesPage"));
export const filesRouteElement = (
  <Route
    path="/files"
    element={
      <Suspense fallback={<p role="status">Chargement de vos fichiers…</p>}>
        <FilesPage />
      </Suspense>
    }
  />
);
