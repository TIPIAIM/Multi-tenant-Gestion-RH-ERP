import type { LucideIcon } from "lucide-react";
import {
  Award,
  Wallet,
Send,
  Building2,
  CalendarDaysIcon,
  CheckSquare2,
  Clock3Icon,
  FileBarChart2,
  LayoutDashboard,
  MapPinned,
  Settings2,
  Users,
  UsersRound,
} from "lucide-react";
import type { UserRole } from "../features/auth/auth.types";

export type NavigationItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
  available: boolean;
  badge?: string;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const allRoles: readonly UserRole[] = [
  "TENANT_ADMIN",
  "DIRECTION",
  "RH_MANAGER",
  "SERVICE_MANAGER",
  "AGENT",
];

export const roleLabels: Record<UserRole, string> = {
  TENANT_ADMIN: "Administrateur",
  DIRECTION: "Direction",
  RH_MANAGER: "Responsable RH",
  SERVICE_MANAGER: "Chef de service",
  AGENT: "Agent",
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Pilotage",
    items: [
      {
        label: "Tableau de bord",
        to: "/dashboard",
        icon: LayoutDashboard,
        roles: allRoles,
        available: true,
      },
      {
        label: "Rapports",
        to: "/reports",
        icon: FileBarChart2,
        roles: ["TENANT_ADMIN", "DIRECTION", "RH_MANAGER", "SERVICE_MANAGER"],
        available: true,
        //  badge: "Bientôt",
      },
    ],
  },
  {
    label: "Organisation",
    items: [
     
      {
        label: "Structure organisationnelle",
        to: "/organisation",
        icon: Building2,
        roles: ["TENANT_ADMIN", "DIRECTION"],
        available: true,
        //  badge: "Bientôt",
      },

      {
        label: "Agents",
        to: "/agents",
        icon: Users,
        roles: ["TENANT_ADMIN", "DIRECTION", "RH_MANAGER", "SERVICE_MANAGER"],
        available: true,
        //  badge: "Bientôt",
      },

      {
        label: "Utilisateurs",
        to: "/users",
        icon: UsersRound,
        roles: ["TENANT_ADMIN", "RH_MANAGER"],
        available: true,
      },
    ],
  },
  {
    label: "Activités",
    items: [
{
  label: "Communications",
  to: "/piece-transfers",
  icon: Send,
  roles: ["TENANT_ADMIN", "DIRECTION", "RH_MANAGER", "SERVICE_MANAGER", "AGENT"],
  available: true,
},

      {
        label: "Tâches",
        to: "/tasks",
        icon: CheckSquare2,
        roles: [
          "TENANT_ADMIN",
          "DIRECTION",
          "RH_MANAGER",
          "SERVICE_MANAGER",
          "AGENT",
        ],
        available: true, //àctive fàlse desàctiver
        //   badge: "Bientôt",
      },

      {
        label: "Feuilles de route",
        to: "/roadmaps",
        icon: MapPinned,
        roles: [
          "TENANT_ADMIN",
          "RH_MANAGER",
          "DIRECTION",
          "SERVICE_MANAGER",
          //"AGENT",
        ],
        available: true,
      },
    ],
  },

  {
    label: "Ressources humaines",
    items: [
      { label: "Paie", to: "/payroll", icon: Wallet, roles: ["TENANT_ADMIN","RH_MANAGER","AGENT"], available: true },
      {
        label: "Pointage",
        to: "/attendance",
        icon: Clock3Icon,
        roles: [
          "TENANT_ADMIN",
          "DIRECTION",
          "RH_MANAGER",
          "SERVICE_MANAGER",
          "AGENT",
        ],
        available: true,
      },

      {
        label: "Congés & absences",
        to: "/leaves",
        icon: CalendarDaysIcon,
        roles: [
          "TENANT_ADMIN",
          "DIRECTION",
          "RH_MANAGER",
          "SERVICE_MANAGER",
          "AGENT",
        ],
        available: true,
      },

      {
        label: "Évaluations",
        to: "/evaluations",
        icon: Award,
        roles: [
          "TENANT_ADMIN",
          "RH_MANAGER",
          "DIRECTION",
          "SERVICE_MANAGER",
          "AGENT",
        ],
        available: true,
        //  badge: "Bientôt",
      },
    ],
  },
  {
    label: "Paramètres",
    items: [
      {
        label: "Configuration",
        to: "/settings",
        icon: Settings2,
        roles: ["TENANT_ADMIN"],
        available: true,
        //badge: "Bientôt",
      },
    ],
  },
];

export function getNavigationGroups(role: UserRole): NavigationGroup[] {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}
