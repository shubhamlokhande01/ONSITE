import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  collection, deleteDoc, doc, getDocs, setDoc, updateDoc,
} from "firebase/firestore";
import {
  Plus, Search, Pencil, Trash2, X, FolderKanban,
  TrendingUp, DollarSign, Building2, CheckCircle2,
  ChevronDown, ChevronUp, ArrowDownToLine, ArrowUpFromLine
} from "lucide-react";
import { toast } from "sonner";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import {
  type Project, type ProjectStatus,
  PROJECT_CATEGORIES, STATUS_LABELS, STATUS_COLORS,
  computeProjectFinancials, fmt, fmtCompact,
} from "@/lib/project-types";
import { logActivity } from "@/lib/activity-logger";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

const EMPTY_PROJECT: Omit<Project, "projectId" | "createdAt" | "createdBy"> = {
  projectName: "", clientName: "", clientPhone: "", clientEmail: "",
  description: "", category: PROJECT_CATEGORIES[0], location: "",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "", status: "planning",
  totalBudget: 0, estimatedCost: 0, actualCost: 0,
  expectedRevenue: 0, receivedRevenue: 0, advancePayments: 0, pendingPayments: 0,
};

type FormData = typeof EMPTY_PROJECT & { projectId?: string };

function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState<FormData | null>(null);
  const [activeTab, setActiveTab] = useState<"basic" | "financial">("basic");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Quick transaction state
  const [quickTx, setQuickTx] = useState<{ projectId: string; type: "in" | "out"; projectName: string } | null>(null);
  const [txAmount, setTxAmount] = useState<number | "">("");
  const [txDesc, setTxDesc] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const db = getDb();
      const [projSnap, incSnap, expSnap] = await Promise.all([
        getDocs(collection(db, "projects")),
        getDocs(collection(db, "income")),
        getDocs(collection(db, "expenses")),
      ]);
      setProjects(projSnap.docs.map((d) => ({ ...(d.data() as Project), projectId: d.id })));
      setIncomes(incSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setExpenses(expSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing || !user) return;
    if (!editing.projectName.trim()) { toast.error("Project name is required"); return; }
    try {
      const db = getDb();
      const id = editing.projectId || crypto.randomUUID();
      const data: Project = {
        ...editing, projectId: id,
        createdAt: Date.now(), createdBy: user.uid, createdByEmail: user.email,
      };
      if (editing.projectId) {
        await updateDoc(doc(db, "projects", id), { ...data });
        await logActivity(user, "UPDATED_PROJECT", { projectId: id, projectName: data.projectName });
        if (data.actualCost > data.totalBudget && data.totalBudget > 0) {
          await setDoc(doc(db, "notifications", crypto.randomUUID()), {
            notifId: crypto.randomUUID(), type: "budget_exceeded",
            title: "Budget Exceeded",
            message: `Project "${data.projectName}" actual cost exceeded the budget.`,
            read: false, createdAt: Date.now(), projectId: id,
          });
        }
        toast.success("Project updated");
      } else {
        await setDoc(doc(db, "projects", id), data);
        await logActivity(user, "CREATED_PROJECT", { projectId: id, projectName: data.projectName });
        toast.success("Project created");
      }
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete project "${name}"?`)) return;
    await deleteDoc(doc(getDb(), "projects", id));
    await logActivity(user, "DELETED_PROJECT", { projectId: id, projectName: name });
    toast.success("Project deleted");
    await load();
  };

  const saveQuickTx = async () => {
    if (!quickTx || !user || !txAmount || txAmount <= 0) return;
    try {
      const db = getDb();
      const proj = projects.find(p => p.projectId === quickTx.projectId);
      if (!proj) return;

      if (quickTx.type === "in") {
        const id = crypto.randomUUID();
        await setDoc(doc(db, "income", id), {
          incomeId: id, projectId: quickTx.projectId, projectName: quickTx.projectName,
          amount: Number(txAmount), paymentDate: new Date().toISOString().split("T")[0],
          paymentMethod: "cash", category: "Project Payment", description: txDesc,
          createdAt: Date.now(), createdBy: user.uid, createdByEmail: user.email, invoiceUrl: ""
        });
        await updateDoc(doc(db, "projects", quickTx.projectId), {
          receivedRevenue: (proj.receivedRevenue || 0) + Number(txAmount)
        });
        await logActivity(user, "ADDED_QUICK_CASH_IN", { projectId: quickTx.projectId, amount: Number(txAmount) });
        toast.success("Cash In recorded successfully");
      } else {
        const id = crypto.randomUUID();
        await setDoc(doc(db, "expenses", id), {
          expenseId: id, projectId: quickTx.projectId, projectName: quickTx.projectName,
          amount: Number(txAmount), expenseType: "miscellaneous", vendorName: "",
          date: new Date().toISOString().split("T")[0], description: txDesc,
          createdAt: Date.now(), createdBy: user.uid, createdByEmail: user.email, billUrl: ""
        });
        await updateDoc(doc(db, "projects", quickTx.projectId), {
          actualCost: (proj.actualCost || 0) + Number(txAmount)
        });
        await logActivity(user, "ADDED_QUICK_CASH_OUT", { projectId: quickTx.projectId, amount: Number(txAmount) });
        toast.success("Cash Out recorded successfully");
      }
      setQuickTx(null);
      setTxAmount("");
      setTxDesc("");
      await load();
    } catch (e) {
      toast.error("Failed to process transaction");
    }
  };

  const totalBudget = projects.reduce((s, p) => s + p.totalBudget, 0);
  const totalRevenue = projects.reduce((s, p) => s + p.receivedRevenue, 0);
  const totalExpenses = projects.reduce((s, p) => s + p.actualCost, 0);
  const activeCount = projects.filter((p) => p.status === "in_progress").length;
  const completedCount = projects.filter((p) => p.status === "completed").length;
  const netProfit = totalRevenue - totalExpenses;

  const filtered = projects.filter((p) => {
    const q = search.toLowerCase();
    const matchQ = !q || p.projectName.toLowerCase().includes(q)
      || p.clientName.toLowerCase().includes(q)
      || p.location.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || p.status === statusFilter;
    const matchC = categoryFilter === "all" || p.category === categoryFilter;
    return matchQ && matchS && matchC;
  });

  const kpis = [
    { label: "Total Projects", value: projects.length, icon: FolderKanban, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Active", value: activeCount, icon: Building2, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Completed", value: completedCount, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Budget", value: fmtCompact(totalBudget), icon: DollarSign, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Revenue Received", value: fmtCompact(totalRevenue), icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Net Profit", value: fmtCompact(netProfit), icon: TrendingUp, color: netProfit >= 0 ? "text-emerald-500" : "text-red-500", bg: netProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">Manage all your projects and financials.</p>
        </div>
        <button
          onClick={() => { setEditing({ ...EMPTY_PROJECT }); setActiveTab("basic"); }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-xl border border-border bg-card p-4">
              <div className={`inline-flex rounded-lg p-2 ${k.bg}`}>
                <Icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <div className="mt-3 text-xl font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, clients, locations…"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="all">All Status</option>
          {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="all">All Categories</option>
          {PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <FolderKanban className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No projects found. Create your first project.</p>
          </div>
        )}
        {filtered.map((p) => {
          const fin = computeProjectFinancials(p);
          const isExpanded = expandedId === p.projectId;
          const projectTxs = [
            ...incomes.filter(i => i.projectId === p.projectId).map(i => ({ ...i, type: 'in' as const, date: i.paymentDate || new Date(i.createdAt).toISOString().split('T')[0] })),
            ...expenses.filter(e => e.projectId === p.projectId).map(e => ({ ...e, type: 'out' as const, date: e.date || new Date(e.createdAt).toISOString().split('T')[0] }))
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt);

          return (
            <div key={p.projectId} className="rounded-xl border border-border bg-card overflow-hidden transition-all duration-200">
              <div 
                className="flex flex-wrap items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : p.projectId)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-lg">{p.projectName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{p.category}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>{p.clientName}</span>
                    {p.location && <span>📍 {p.location}</span>}
                    {p.startDate && <span>📅 {p.startDate} → {p.endDate || "TBD"}</span>}
                  </div>
                </div>
                <div className="hidden gap-6 sm:flex">
                  <Stat label="Budget" value={fmtCompact(p.totalBudget)} />
                  <Stat label="Revenue" value={fmtCompact(p.receivedRevenue)} />
                  <Stat label="Net" value={fmtCompact(fin.netProfit)} accent={fin.netProfit >= 0 ? "green" : "red"} />
                </div>
                <div className="flex items-center gap-1">
                  <div className="rounded-md p-1.5 hover:bg-accent text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border bg-muted/20 p-5">
                  {/* Quick Actions */}
                  <div className="mb-6 flex flex-wrap gap-3">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setQuickTx({ projectId: p.projectId, projectName: p.projectName, type: "in" }); }}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/25 transition-colors"
                    >
                      <ArrowDownToLine className="h-4 w-4" /> Add Cash In
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setQuickTx({ projectId: p.projectId, projectName: p.projectName, type: "out" }); }}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 px-4 py-2 text-sm font-semibold hover:bg-red-500/25 transition-colors"
                    >
                      <ArrowUpFromLine className="h-4 w-4" /> Add Cash Out
                    </button>
                    <div className="flex-1" />
                    <button onClick={(e) => { e.stopPropagation(); setEditing({ ...p }); setActiveTab("basic"); }}
                      className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
                      <Pencil className="h-4 w-4" /> Edit Project
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); remove(p.projectId, p.projectName); }}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    <FinCard label="Total Budget" value={fmt(p.totalBudget)} />
                    <FinCard label="Est. Cost" value={fmt(p.estimatedCost)} />
                    <FinCard label="Actual Cost" value={fmt(p.actualCost)} />
                    <FinCard label="Expected Rev." value={fmt(p.expectedRevenue)} />
                    <FinCard label="Received Rev." value={fmt(p.receivedRevenue)} accent="green" />
                    <FinCard label="Remaining" value={fmt(fin.remainingRevenue)} accent={fin.remainingRevenue > 0 ? "amber" : "green"} />
                    <FinCard label="Profit Margin" value={`${fin.profitMargin.toFixed(1)}%`} accent={fin.profitMargin > 0 ? "green" : "red"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <FinCard label="Cash In" value={fmt(fin.totalCashIn)} accent="green" />
                    <FinCard label="Cash Out" value={fmt(fin.totalCashOut)} accent="red" />
                    <FinCard label="Advance Paid" value={fmt(p.advancePayments)} />
                    <FinCard label="Pending" value={fmt(p.pendingPayments)} accent="amber" />
                  </div>
                  
                  {projectTxs.length > 0 && (
                    <div className="mt-6 border-t border-border pt-5">
                      <h3 className="mb-3 font-semibold text-sm">Transaction History</h3>
                      <div className="space-y-2">
                        {projectTxs.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between rounded-lg bg-background p-3 border border-border">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${tx.type === 'in' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'}`}>
                                {tx.type === 'in' ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{tx.description || (tx.type === 'in' ? "Payment Received" : "Expense")}</div>
                                <div className="text-xs text-muted-foreground">{new Date(tx.date).toLocaleDateString('en-IN')} • {tx.type === 'in' ? tx.paymentMethod : tx.expenseType}</div>
                              </div>
                            </div>
                            <div className={`font-semibold ${tx.type === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                              {tx.type === 'in' ? '+' : '-'} {fmt(tx.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {p.description && (
                    <p className="mt-5 rounded-lg bg-background p-4 text-sm text-muted-foreground border border-border">
                      {p.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Tx Modal */}
      {quickTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setQuickTx(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl p-6">
            <h3 className="text-lg font-semibold mb-1">
              Record {quickTx.type === "in" ? "Cash In" : "Cash Out"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              For project: {quickTx.projectName}
            </p>
            
            <div className="space-y-4">
              <F label="Amount (₹) *">
                <input 
                  type="number" 
                  className="input text-lg font-semibold" 
                  value={txAmount} 
                  onChange={(e) => setTxAmount(Number(e.target.value) || "")} 
                  autoFocus
                />
              </F>
              <F label="Description (Optional)">
                <input 
                  type="text" 
                  className="input" 
                  value={txDesc} 
                  onChange={(e) => setTxDesc(e.target.value)} 
                  placeholder={quickTx.type === "in" ? "e.g. Milestone 1 payment" : "e.g. Raw materials"}
                />
              </F>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setQuickTx(null)} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent">Cancel</button>
                <button 
                  onClick={saveQuickTx}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                    quickTx.type === "in" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  Save Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Edit Modal */}
      {editing !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="flex h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">
                {editing.projectId ? "Edit Project" : "New Project"}
              </h2>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                <F label="Project Name *" span={2}>
                  <input value={editing.projectName}
                    onChange={(e) => setEditing({ ...editing, projectName: e.target.value })}
                    placeholder="e.g. Office Renovation Phase 1" className="input" />
                </F>
                
                <F label="Client Name">
                  <input value={editing.clientName}
                    onChange={(e) => setEditing({ ...editing, clientName: e.target.value })}
                    className="input" />
                </F>
                
                <F label="Client Phone">
                  <input value={editing.clientPhone}
                    onChange={(e) => setEditing({ ...editing, clientPhone: e.target.value })}
                    type="tel" className="input" />
                </F>
                
                <F label="Location" span={2}>
                  <input value={editing.location}
                    onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                    placeholder="City, State" className="input" />
                </F>
                
                <F label="Start Date">
                  <input type="date" value={editing.startDate}
                    onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                    className="input" />
                </F>
                
                <F label="End Date">
                  <input type="date" value={editing.endDate}
                    onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
                    className="input" />
                </F>

                <div className="col-span-2 mt-2 border-t border-border pt-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Financials</h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <F label="Total Budget (₹)">
                      <input type="number" value={editing.totalBudget || ""}
                        onChange={(e) => setEditing({ ...editing, totalBudget: +e.target.value })}
                        className="input" min={0} placeholder="0" />
                    </F>
                    <F label="Payment In (₹)">
                      <input type="number" value={editing.receivedRevenue || ""}
                        onChange={(e) => setEditing({ ...editing, receivedRevenue: +e.target.value, expectedRevenue: Math.max(editing.expectedRevenue, +e.target.value) })}
                        className="input" min={0} placeholder="0" />
                    </F>
                    <F label="Payment Out (₹)">
                      <input type="number" value={editing.actualCost || ""}
                        onChange={(e) => setEditing({ ...editing, actualCost: +e.target.value, estimatedCost: Math.max(editing.estimatedCost, +e.target.value) })}
                        className="input" min={0} placeholder="0" />
                    </F>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <button onClick={() => setEditing(null)}
                className="rounded-lg border border-input px-5 py-2 text-sm hover:bg-accent">
                Cancel
              </button>
              <button onClick={save}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Save Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, children, span = 1 }: { label: string; children: React.ReactNode; span?: 1 | 2 }) {
  return (
    <label className={`block text-sm ${span === 2 ? "col-span-2" : ""}`}>
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "green" | "red" }) {
  return (
    <div className="text-right">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${accent === "green" ? "text-emerald-600 dark:text-emerald-400" : accent === "red" ? "text-red-500" : ""}`}>{value}</div>
    </div>
  );
}

function FinCard({ label, value, accent }: { label: string; value: string; accent?: "green" | "red" | "amber" }) {
  const color = accent === "green" ? "text-emerald-600 dark:text-emerald-400"
    : accent === "red" ? "text-red-500"
    : accent === "amber" ? "text-amber-600 dark:text-amber-400"
    : "text-foreground";
  return (
    <div className="rounded-lg bg-background/60 p-3 border border-border/50">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-semibold ${color}`}>{value}</div>
    </div>
  );
}
