import { useAuth } from "../../features/auth/auth.context";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTenantSettings } from "../../features/settings/settings.context";
import { featureForPath } from "../../features/settings/module-access";
export default function ModuleRoute() {
  const { settings, isLoading, isError, refetch } = useTenantSettings();
  const { user } = useAuth();
  const feature = featureForPath(useLocation().pathname);
  if (
    feature === "payroll" &&
    !["TENANT_ADMIN", "RH_MANAGER", "AGENT"].includes(user?.role ?? "")
  )
    return <Navigate to="/dashboard" replace />;
  if (!feature) return <Outlet />;
  if (isLoading) return <p role="status">Chargement des modules…</p>;
  if (isError || !settings)
    return (
      <div role="alert">
        Impossible de vérifier les modules.{" "}
        <button onClick={() => void refetch()}>Réessayer</button>
      </div>
    );
  if (!settings.featureFlags[feature])
    return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
