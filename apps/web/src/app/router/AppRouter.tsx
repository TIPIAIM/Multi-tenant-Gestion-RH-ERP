import PayrollPage from "../../features/payroll/PayrollPage";
import ModuleRoute from "./ModuleRoute";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../../features/auth/auth.context";
import LoginPage from "../../pages/auth/LoginPage";
import ProtectedRoute from "./ProtectedRoute";
import "./app-router.css";
import DashboardLayout from "../../layouts/DashboardLayout";
import DashboardHomePage from "../../pages/dashboard/DashboardHomePage";
import OrganizationPage from "../../pages/organisation/OrganizationPage";
import AgentsPage from "../../features/agents/AgentsPage";
import TasksPage from "../../pages/tasks/TasksPage";
import AttendancePage from "../../pages/attendance/AttendancePage";
import UsersPage from "../../pages/users/UsersPage";
import LeavesPage from "../../pages/leaves/LeavesPage";
import RoadmapsPage from "../../pages/roadmaps/RoadmapsPage";
import EvaluationsPage from "../../pages/evaluations/EvaluationsPage";
import ReportsPage from "../../pages/reports/ReportsPage";
import SettingsPage from "../../pages/settings/SettingsPage";
import CreateWorkspacePage from "../../pages/public/CreateWorkspacePage";
import PieceTransfersPage from "../../pages/piece-transfers/PieceTransfersPage";
//import RoadmapsPage from "../../pages/roadmaps/RoadmapsPage";



function SessionLoader() {
  return (
    <main className="app-router-loader">
      <div>
        <span className="app-router-loader-mark">F</span>
        <p>Vérification sécurisée de votre session ...</p>
      </div>
    </main>
  );
}

export default function AppRouter() {
  const { user, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return <SessionLoader />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
{/* 
      <Route path="/creer-espace" element={<CreateWorkspacePage />} />
   */}  <Route path="/register" element={<CreateWorkspacePage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route element={<ModuleRoute />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route path="/dashboard" element={<DashboardHomePage />} />
          <Route path="/organisation" element={<OrganizationPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/leaves" element={<LeavesPage />} />
          <Route path="/roadmaps" element={<RoadmapsPage />} />
          <Route path="/evaluations" element={<EvaluationsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/settings" element={<SettingsPage />} />
       
       <Route path="piece-transfers" element={<PieceTransfersPage />} />
       
          </Route>
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
      />
    </Routes>
  );
}
