import CommunicationMentionNotice from "../features/piece-transfers/CommunicationMentionNotice";
import {
    useEffect,
    useState,
    useRef,
    type CSSProperties,
  } from "react";
  import { useQuery } from "@tanstack/react-query";
  import {
    Bell,
    BellRing,
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
  import { getNavigationGroups, roleLabels } from "../config/navigation";
  import { useAuth } from "../features/auth/auth.context";
  import { getCurrentTenant } from "../features/tenant/tenant.api";
  import "./dashboard-layout.css";
  import "./communication-notifications.css";
  import { usePieceTransferNotifications } from "../features/piece-transfers/use-piece-transfer-notifications";
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
    const notificationsQuery = usePieceTransferNotifications();
    const unreadMessages = notificationsQuery.data?.unreadMessages ?? 0;
    const unreadCommunications = notificationsQuery.data?.unreadCommunications ?? 0;
    const notificationsKnown = Boolean(notificationsQuery.data) && !notificationsQuery.isError;
    const notificationLabel = !notificationsKnown
      ? notificationsQuery.isError ? "Notifications momentanément indisponibles" : "Vérification des messages non lus"
      : unreadMessages > 0
        ? `${unreadMessages} message${unreadMessages > 1 ? "s" : ""} non lu${unreadMessages > 1 ? "s" : ""} dans ${unreadCommunications} communication${unreadCommunications > 1 ? "s" : ""}`
        : "Aucun message non lu";

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
      try { return window.localStorage.getItem("fades-rh-sidebar-collapsed") === "true"; }
      catch { return false; }
    });
    const sidebarRef = useRef<HTMLElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);
    const profileButtonRef = useRef<HTMLButtonElement>(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const tenantQuery = useQuery({
      queryKey: ["current-tenant"],
      queryFn: getCurrentTenant,
      staleTime: 1000 * 60 * 10,
    });
    useEffect(() => {
      try { window.localStorage.setItem("fades-rh-sidebar-collapsed", String(isSidebarCollapsed)); }
      catch { /* Le stockage bloqué ne doit pas bloquer la navigation. */ }
    }, [isSidebarCollapsed]);
    useEffect(() => {
      const desktop = window.matchMedia("(min-width: 1024px)");
      const handleChange = () => { if (desktop.matches) setIsSidebarOpen(false); };
      desktop.addEventListener("change", handleChange);
      return () => desktop.removeEventListener("change", handleChange);
    }, []);
    useEffect(() => {
      if (!isSidebarOpen) return;
      const sidebar = sidebarRef.current;
      const focusables = () => Array.from(sidebar?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex="0"]',
      ) ?? []).filter((element) => element.getClientRects().length > 0);
      const focusTimer = window.setTimeout(() => focusables()[0]?.focus(), 190);
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") { event.preventDefault(); setIsSidebarOpen(false); }
        if (event.key !== "Tab") return;
        const elements = focusables();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) { event.preventDefault(); return; }
        if (!sidebar?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      document.addEventListener("keydown", onKeyDown);
      return () => {
        window.clearTimeout(focusTimer);
        document.removeEventListener("keydown", onKeyDown);
        if (document.activeElement && sidebar?.contains(document.activeElement)) menuButtonRef.current?.focus();
      };
    }, [isSidebarOpen]);
    useEffect(() => {
      if (!isProfileMenuOpen) return;
      const onPointerDown = (event: PointerEvent) => {
        if (event.target instanceof Node && !profileRef.current?.contains(event.target)) setIsProfileMenuOpen(false);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") { setIsProfileMenuOpen(false); profileButtonRef.current?.focus(); }
      };
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [isProfileMenuOpen]);
    useEffect(() => {
      setIsSidebarOpen(false);
      setIsProfileMenuOpen(false);
    }, [location.pathname, location.search]);
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
    const organizationName = tenantQuery.data?.name?.replace(/fades/gi, "Organisation") ?? "Mon organisation";
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
        <a className="ui-skip-link" href="#main-content">Aller au contenu</a>
        {isSidebarOpen && (
          <button
            className="dashboard-sidebar-backdrop"
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        <aside ref={sidebarRef} id="dashboard-sidebar" className={sidebarClassName} aria-label="Navigation principale">
          <div className="sidebar-background-orb sidebar-orb-one" />
          <div className="sidebar-background-orb sidebar-orb-two" />
          <div className="sidebar-background-grid" />
          <div className="dashboard-sidebar-content">
            <div className="dashboard-sidebar-toolbar">
              <div className="dashboard-brand-shell">
                <div className="dashboard-logo-wrap">
                  <ShieldCheck size={28} aria-hidden="true" />
                  <span className="dashboard-brand-name">RH</span>
                </div>
                <div className="dashboard-brand-copy">
                  <span>
                    <Sparkles size={13} />
                    Plateforme RH
                  </span>
                  <strong>Votre espace de travail</strong>
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
              title={`${organizationName} · Organisation active`}
            >
              <span className="dashboard-tenant-pulse" />
              <span className="dashboard-tenant-badge-copy">
                {organizationName}
              </span>
            </div>
            <nav className="dashboard-navigation">
              {navigationGroups.map((group) => (
                <section key={group.label} className="dashboard-nav-group">
                  <p className="dashboard-nav-group-title">{group.label}</p>
                  <div className="dashboard-nav-list">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isCommunications = item.to === "/piece-transfers";

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
                          to={isCommunications && unreadMessages > 0 ? `${item.to}?unread=1` : item.to}
                          data-tooltip={isCommunications ? `${item.label} · ${notificationLabel}` : item.label}
                          aria-label={isCommunications ? `${item.label} · ${notificationLabel}` : item.label}
                          title={isCommunications ? notificationLabel : item.label}
                          className={({ isActive }) =>
                            `dashboard-nav-link ${isCommunications ? "dashboard-communications-link" : ""} ${
                              isActive ? "is-active" : ""
                            }`
                          }
                        >
                          <span className="dashboard-nav-item-main">
                            <Icon size={18} />
                            <span>{item.label}</span>
                          </span>
                          {isCommunications && (
                            <span className={`dashboard-communication-status ${!notificationsKnown ? "is-unknown" : unreadMessages > 0 ? "has-unread" : "is-clear"}`} aria-hidden="true">
                              {unreadMessages > 0 ? <BellRing size={14} /> : <Bell size={14} />}
                              {unreadMessages > 0 ? <span className="dashboard-communication-count">{unreadMessages > 99 ? "99+" : unreadMessages}</span> : <span className="dashboard-communication-dot" />}
                            </span>
                          )}
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
                ref={menuButtonRef}
                aria-controls="dashboard-sidebar"
                aria-expanded={isSidebarOpen}
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
              <NavLink to={unreadMessages > 0 ? "/piece-transfers?unread=1" : "/piece-transfers"}
                className={`dashboard-communication-shortcut ${!notificationsKnown ? "is-unknown" : unreadMessages > 0 ? "has-unread" : "is-clear"}`}
                aria-label={`Communications · ${notificationLabel}`} title={notificationLabel}>
                {unreadMessages > 0 ? <BellRing size={19} /> : <Bell size={19} />}
                {unreadMessages > 0 ? <span className="dashboard-communication-count">{unreadMessages > 99 ? "99+" : unreadMessages}</span> : <span className="dashboard-communication-dot" />}
              </NavLink>
              <div ref={profileRef} className="dashboard-profile-container">
                <button
                  className="dashboard-profile-button"
                  ref={profileButtonRef}
                  aria-label="Menu du compte"
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
          <main id="main-content" tabIndex={-1} className="dashboard-content">
            <span className="communication-sr-only" role="status" aria-live="polite" aria-atomic="true">{notificationLabel}</span>
            <CommunicationMentionNotice />
            <Outlet />
          </main>
        </div>
      </div>
    );
  }
