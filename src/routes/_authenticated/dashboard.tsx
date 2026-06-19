import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Users, ClipboardList, TrendingUp, TrendingDown, DollarSign, FolderKanban } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { todayKey } from "@/lib/geo";
import { fmtCompact } from "@/lib/project-types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface Stats {
  totalEmployees: number;
  presentToday: number;
  totalTasks: number;
  completedTasks: number;
  totalProjects: number;
  activeProjects: number;
  totalBudget: number;
  totalRevenue: number;
  totalExpenses: number;
}

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void (async () => {
      const db = getDb();
      const [empSnap, attSnap, taskSnap, projSnap, incSnap, expSnap] = await Promise.all([
        getDocs(collection(db, "employees")),
        getDocs(query(collection(db, "attendance"), where("date", "==", todayKey()))),
        getDocs(collection(db, "tasks")),
        getDocs(collection(db, "projects")),
        getDocs(collection(db, "income")),
        getDocs(collection(db, "expenses")),
      ]);

      const totalEmployees = empSnap.size;
      const presentToday = attSnap.size;
      
      let totalBudget = 0;
      let activeProjects = 0;
      projSnap.forEach((d) => {
        const p = d.data();
        totalBudget += (p.totalBudget || 0);
        if (p.status === "in_progress") activeProjects++;
      });

      let totalRevenue = 0;
      incSnap.forEach((d) => totalRevenue += (d.data().amount || 0));

      let totalExpenses = 0;
      expSnap.forEach((d) => totalExpenses += (d.data().amount || 0));

      setStats({
        totalEmployees,
        presentToday,
        totalTasks: taskSnap.size,
        completedTasks: taskSnap.docs.filter(d => d.data().status === "completed").length,
        totalProjects: projSnap.size,
        activeProjects,
        totalBudget,
        totalRevenue,
        totalExpenses,
      });
    })();
  }, []);

  const netProfit = (stats?.totalRevenue || 0) - (stats?.totalExpenses || 0);

  const kpis = [
    { label: "Active Projects", value: stats?.activeProjects ?? 0, icon: FolderKanban, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Total Revenue", value: fmtCompact(stats?.totalRevenue ?? 0), icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Expenses", value: fmtCompact(stats?.totalExpenses ?? 0), icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10" },
    { label: "Net Profit", value: fmtCompact(netProfit), icon: DollarSign, color: netProfit >= 0 ? "text-emerald-500" : "text-red-500", bg: netProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10" },
    { label: "Total Employees", value: stats?.totalEmployees ?? 0, icon: Users, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Completed Tasks", value: stats?.completedTasks ?? 0, icon: ClipboardList, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  const financialData = [
    { name: "Revenue", value: stats?.totalRevenue ?? 0, fill: "var(--color-emerald-500)" },
    { name: "Expenses", value: stats?.totalExpenses ?? 0, fill: "var(--color-red-500)" },
    { name: "Profit", value: Math.max(0, netProfit), fill: "var(--color-blue-500)" },
  ];

  const PIE_COLORS = ["#10b981", "#ef4444"]; // emerald-500, red-500
  const cashflowPie = [
    { name: "Inflow", value: stats?.totalRevenue ?? 0 },
    { name: "Outflow", value: stats?.totalExpenses ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {user?.fullName ?? user?.email}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's what's happening across your projects today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-border bg-card p-5">
              <div className={`inline-flex rounded-lg p-2 ${c.bg}`}>
                <Icon className={`h-5 w-5 ${c.color}`} />
              </div>
              <div className="mt-3 text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 font-semibold">Financial Overview</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={financialData} margin={{ left: -15, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmtCompact(v)} />
              <Tooltip formatter={(value: number) => fmtCompact(value)} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 font-semibold">Cash Flow Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={cashflowPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label>
                {cashflowPie.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => fmtCompact(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}