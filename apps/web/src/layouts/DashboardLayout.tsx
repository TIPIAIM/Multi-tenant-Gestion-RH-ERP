import {
    useEffect,
    useState,
    type CSSProperties,
  } from "react";
  import { useQuery } from "@tanstack/react-query";
  import {
    ChevronDown,
    LogOut,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    ShieldCheck,
    Sparkles,
    X,
  } from "lucide-react";
  import { NavLink, Outlet, useLocation } from "react-router-dom";
  import logoFades from "../assets/logo-fades.png";
  import { getNavigationGroups, roleLabels } from "../config/navigation";
  import { useAuth } from "../features/auth/auth.context";
  import { getCurrentTenant } from "../features/tenant/tenant.api";
  import "./dashboard-layout.css";
  
  function getInitials(fullName: string): string {
    const initials = fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name.charAt(0).toUpperCase())
      .join("");
  
    return initials || "U";
  }
  
  export default function DashboardLayout() {
    const { user, logout } = useAuth();
    const location = useLocation();
  
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
  
    const tenantQuery = useQuery({
      queryKey: ["current-tenant"],
      queryFn: getCurrentTenant,
      staleTime: 1000 * 60 * 10,
    });
  
    useEffect(() => {
      const storedValue = window.localStorage.getItem(
        "fades-rh-sidebar-collapsed",
      );
  
      setIsSidebarCollapsed(storedValue === "true");
    }, []);
  
    useEffect(() => {
      window.localStorage.setItem(
        "fades-rh-sidebar-collapsed",
        String(isSidebarCollapsed),
      );
    }, [isSidebarCollapsed]);
  
    useEffect(() => {
      setIsSidebarOpen(false);
      setIsProfileMenuOpen(false);
    }, [location.pathname]);
  
    useEffect(() => {
      if (!isSidebarOpen) {
        return;
      }
  
      const previousOverflow = document.body.style.overflow;
  
      document.body.style.overflow = "hidden";
  
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }, [isSidebarOpen]);
  
    if (!user) {
      return null;
    }
  
    const navigationGroups = getNavigationGroups(user.role);
  
    const activeNavigationItem = navigationGroups
      .flatMap((group) => group.items)
      .find(
        (item) =>
          item.available &&
          (location.pathname === item.to ||
            location.pathname.startsWith(`${item.to}/`)),
      );
  
    const pageTitle = activeNavigationItem?.label ?? "Tableau de bord";
  
    const tenantTheme = {
      "--tenant-primary":
        tenantQuery.data?.branding.primaryColor ?? "#046242",
      "--tenant-secondary":
        tenantQuery.data?.branding.secondaryColor ?? "#1A7543",
      "--tenant-accent":
        tenantQuery.data?.branding.accentColor ?? "#E9B521",
    } as CSSProperties;
  
    const sidebarClassName = [
      "dashboard-sidebar",
      isSidebarOpen ? "is-open" : "",
      isSidebarCollapsed ? "is-collapsed" : "",
    ]
      .filter(Boolean)
      .join(" ");
  
    async function handleLogout(): Promise<void> {
      setIsLoggingOut(true);
  
      try {
        await logout();
      } finally {
        setIsLoggingOut(false);
        setIsProfileMenuOpen(false);
      }
    }
  
    return (
      <div
        className={`dashboard-app ${
          isSidebarCollapsed ? "is-sidebar-collapsed" : ""
        }`}
        style={tenantTheme}
      >
        {isSidebarOpen && (
          <button
            className="dashboard-sidebar-backdrop"
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
  
        <aside className={sidebarClassName}>
          <div className="sidebar-background-orb sidebar-orb-one" />
          <div className="sidebar-background-orb sidebar-orb-two" />
          <div className="sidebar-background-grid" />
  
          <div className="dashboard-sidebar-content">
            <div className="dashboard-sidebar-toolbar">
              <div className="dashboard-brand-shell">
                <div className="dashboard-logo-wrap">
                  <img
                    src={logoFades}
                    alt="FADES — Fonds d’Aide au Développement du Sport"
                    className="dashboard-logo"
                  />
                </div>
  
                <div className="dashboard-brand-copy">
                  <span>
                    <Sparkles size={13} />
                    Plaforme-RH
                  </span>
  
                  <strong>L’ambition au service du sport</strong>
                </div>
              </div>
  
              <button
                className="dashboard-sidebar-close"
                type="button"
                aria-label="Fermer le menu"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
  
            <button
              className="dashboard-sidebar-toggle"
              type="button"
              onClick={() =>
                setIsSidebarCollapsed((currentValue) => !currentValue)
              }
              aria-label={
                isSidebarCollapsed
                  ? "Développer la barre latérale"
                  : "Réduire la barre latérale"
              }
              title={
                isSidebarCollapsed
                  ? "Développer la barre latérale"
                  : "Réduire la barre latérale"
              }
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
  
            <div
              className="dashboard-tenant-badge"
              title={`${tenantQuery.data?.name ?? "FADES"} · Tenant actif`}
            >
              <span className="dashboard-tenant-pulse" />
  
              <span className="dashboard-tenant-badge-copy">
                {tenantQuery.data?.name ?? "FADES"} · Environnement actif
              </span>
            </div>
  
            <nav className="dashboard-navigation">
              {navigationGroups.map((group) => (
                <section key={group.label} className="dashboard-nav-group">
                  <p className="dashboard-nav-group-title">{group.label}</p>
  
                  <div className="dashboard-nav-list">
                    {group.items.map((item) => {
                      const Icon = item.icon;
  
                      if (!item.available) {
                        return (
                          <span
                            key={item.label}
                            className="dashboard-nav-disabled"
                            data-tooltip={item.label}
                            title={`${item.label} sera disponible dans un prochain module.`}
                          >
                            <span className="dashboard-nav-item-main">
                              <Icon size={18} />
                              <span>{item.label}</span>
                            </span>
  
                            {item.badge && (
                              <span className="dashboard-nav-badge">
                                {item.badge}
                              </span>
                            )}
                          </span>
                        );
                      }
  
                      return (
                        <NavLink
                          key={item.label}
                          to={item.to}
                          data-tooltip={item.label}
                          className={({ isActive }) =>
                            `dashboard-nav-link ${
                              isActive ? "is-active" : ""
                            }`
                          }
                        >
                          <span className="dashboard-nav-item-main">
                            <Icon size={18} />
                            <span>{item.label}</span>
                          </span>
                        </NavLink>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>
  
            <div className="dashboard-sidebar-footer">
              <div
                className="dashboard-sidebar-user"
                title={`${user.fullName} · ${roleLabels[user.role]}`}
              >
                <span className="dashboard-avatar">
                  {getInitials(user.fullName)}
                </span>
  
                <div className="dashboard-sidebar-user-copy">
                  <strong>{user.fullName}</strong>
                  <span>{roleLabels[user.role]}</span>
                </div>
              </div>
  
              <div className="dashboard-security-status">
                <ShieldCheck size={16} />
                <span>Session sécurisée</span>
              </div>
            </div>
          </div>
        </aside>
  
        <div className="dashboard-main">
          <header className="dashboard-topbar">
            <div className="dashboard-topbar-left">
              <button
                className="dashboard-menu-button"
                type="button"
                aria-label="Ouvrir le menu"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu size={21} />
              </button>
  
              <div className="dashboard-page-heading">
                <p>Plateforme-RH · Pilotage </p>
                <h1>{pageTitle}</h1>
              </div>
            </div>
  
            <div className="dashboard-topbar-right">
              <div className="dashboard-live-indicator">
                <span />
                <span>Système en ligne</span>
              </div>
  
              <div className="dashboard-profile-container">
                <button
                  className="dashboard-profile-button"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isProfileMenuOpen}
                  onClick={() =>
                    setIsProfileMenuOpen((currentValue) => !currentValue)
                  }
                >
                  <span className="dashboard-profile-avatar">
                    {getInitials(user.fullName)}
                  </span>
  
                  <span className="dashboard-profile-copy">
                    <strong>{user.fullName}</strong>
                    <small>{roleLabels[user.role]}</small>
                  </span>
  
                  <ChevronDown size={17} />
                </button>
  
                {isProfileMenuOpen && (
                  <div className="dashboard-profile-menu" role="menu">
                    <div className="dashboard-profile-menu-info">
                      <strong>{user.fullName}</strong>
                      <span>{user.email}</span>
                    </div>
  
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleLogout()}
                      disabled={isLoggingOut}
                    >
                      <LogOut size={17} />
                      <span>
                        {isLoggingOut
                          ? "Déconnexion..."
                          : "Se déconnecter"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
  
          <main className="dashboard-content">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }