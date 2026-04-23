import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, FileStack, Receipt, Users, LogOut, Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
  <NavLink
    to={to}
    end={to === "/"}
    className={({ isActive }) =>
      cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-primary-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )
    }
  >
    <Icon className="h-4 w-4" />
    {label}
  </NavLink>
);

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="mt-4 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
    {children}
  </div>
);

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const { t, lang, setLang } = useI18n();
  const { signOut, user } = useAuth();
  const location = useLocation();

  const mobileTabs = [
    { to: "/", label: t("nav.summary"), icon: LayoutDashboard },
    { to: "/partes", label: t("nav.parts"), icon: FileStack },
    { to: "/costes/consumos", label: t("nav.costs"), icon: Receipt },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[260px] flex-col bg-gradient-sidebar border-r border-sidebar-border">
        <div className="px-5 py-6 border-b border-sidebar-border/40">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold">
              L
            </div>
            <div>
              <h1 className="text-sidebar-foreground font-bold text-lg leading-none">{t("app.name")}</h1>
              <p className="text-sidebar-foreground/60 text-xs mt-1">{t("app.tagline")}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          <SectionLabel>{t("nav.summary")}</SectionLabel>
          <NavItem to="/" icon={LayoutDashboard} label={t("nav.dashboard")} />

          <SectionLabel>{t("nav.parts")}</SectionLabel>
          <NavItem to="/partes" icon={FileStack} label={t("nav.parts.list")} />

          <SectionLabel>{t("nav.costs")}</SectionLabel>
          <NavItem to="/costes/consumos" icon={Receipt} label={t("nav.costs.consumption")} />
          <NavItem to="/costes/asistencia" icon={Users} label={t("nav.costs.attendance")} />
        </nav>

        <div className="border-t border-sidebar-border/40 p-3 space-y-2">
          <div className="flex items-center gap-2 px-2">
            <Globe className="h-4 w-4 text-sidebar-foreground/60" />
            <button
              onClick={() => setLang("es")}
              className={cn(
                "text-xs font-medium px-2 py-1 rounded",
                lang === "es" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
              )}
            >
              ES
            </button>
            <button
              onClick={() => setLang("en")}
              className={cn(
                "text-xs font-medium px-2 py-1 rounded",
                lang === "en" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
              )}
            >
              EN
            </button>
          </div>
          <div className="px-2 py-1 text-xs text-sidebar-foreground/60 truncate" title={user?.email ?? ""}>
            {user?.email}
          </div>
          <Button
            onClick={signOut}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t("auth.signout")}
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-secondary text-secondary-foreground border-b border-sidebar-border/40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            L
          </div>
          <span className="font-semibold">{t("app.name")}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLang(lang === "es" ? "en" : "es")}
            className="text-xs font-medium uppercase opacity-70 hover:opacity-100"
          >
            {lang}
          </button>
          <button onClick={signOut} className="opacity-70 hover:opacity-100">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="lg:pl-[260px] pb-20 lg:pb-0 min-h-screen">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-8 max-w-7xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-secondary text-secondary-foreground border-t border-sidebar-border/40 grid grid-cols-3">
        {mobileTabs.map((tab) => {
          const isActive =
            tab.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(tab.to);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex flex-col items-center gap-1 py-3 text-xs",
                isActive ? "text-primary" : "text-secondary-foreground/70"
              )}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
