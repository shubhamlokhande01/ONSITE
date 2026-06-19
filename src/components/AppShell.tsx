import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Clock,
  Image as ImageIcon,
  FileBarChart,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Briefcase,
  FolderKanban,
  DollarSign,
  Receipt,
  FileUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/income", label: "Income", icon: DollarSign },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/documents", label: "Documents", icon: FileUp },
  { to: "/employees", label: "Employees", icon: Users, adminOnly: true },
  { to: "/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/attendance", label: "Attendance", icon: Clock },
  { to: "/photos", label: "Field Photos", icon: ImageIcon },
  { to: "/reports", label: "Reports", icon: FileBarChart, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme") === "dark";
    setDark(saved);
    document.documentElement.classList.toggle("dark", saved);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await signOut();
    router.navigate({ to: "/auth" });
  };

  const items = NAV.filter((n) => !n.adminOnly || user?.role === "admin");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <span className="font-semibold">FieldOps</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 hover:bg-accent"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="hidden items-center gap-2 border-b border-sidebar-border px-6 py-5 lg:flex">
            <Briefcase className="h-6 w-6 text-sidebar-primary" />
            <div>
              <div className="font-semibold">FieldOps</div>
              <div className="text-xs text-muted-foreground">Field Management</div>
            </div>
          </div>

          <nav className="space-y-1 p-3">
            {items.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="absolute inset-x-0 bottom-0 border-t border-sidebar-border p-3">
            <div className="mb-2 rounded-md bg-sidebar-accent px-3 py-2">
              <div className="truncate text-sm font-medium">
                {user?.fullName ?? user?.email}
              </div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {user?.role}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        {open && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* Main */}
        <main className="flex-1 lg:ml-0">
          <div className="flex items-center justify-end border-b border-border bg-card px-6 py-3">
            <button
              onClick={toggleDark}
              className="rounded-md p-2 hover:bg-accent"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}