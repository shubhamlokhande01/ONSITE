import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Plus, Search, Pencil, Trash2, X, TrendingDown, FileUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getDb, getStorageRef } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Project } from "@/lib/project-types";
import {
  type ExpenseRecord, type ExpenseType,
  EXPENSE_TYPE_LABELS, EXPENSE_TYPE_COLORS, fmt, fmtCompact,
} from "@/lib/project-types";
import { logActivity } from "@/lib/activity-logger";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
});

const EMPTY: Omit<ExpenseRecord, "expenseId" | "createdAt" | "createdBy"> = {
  projectId: "", projectName: "", amount: 0,
  expenseType: "material", vendorName: "",
  date: new Date().toISOString().split("T")[0],
  description: "", billUrl: "",
};

type FormData = typeof EMPTY & { expenseId?: string; _file?: File | null };

function ExpensesPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [editing, setEditing] = useState<FormData | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [expSnap, projSnap] = await Promise.all([
        getDocs(collection(getDb(), "expenses")),
        getDocs(collection(getDb(), "projects")),
      ]);
      setRecords(expSnap.docs.map((d) => ({ ...(d.data() as ExpenseRecord), expenseId: d.id }))
        .sort((a, b) => b.createdAt - a.createdAt));
      setProjects(projSnap.docs.map((d) => ({ ...(d.data() as Project), projectId: d.id })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing || !user) return;
    if (!editing.projectId) { toast.error("Select a project"); return; }
    if (editing.amount <= 0) { toast.error("Amount must be greater than 0"); return; }
    try {
      setUploading(true);
      const db = getDb();
      const id = editing.expenseId || crypto.randomUUID();
      let billUrl = editing.billUrl || "";

      if (editing._file) {
        const storageRef = ref(getStorageRef(), `bills/${id}/${editing._file.name}`);
        await uploadBytes(storageRef, editing._file);
        billUrl = await getDownloadURL(storageRef);
      }

      const proj = projects.find((p) => p.projectId === editing.projectId);
      const data: ExpenseRecord = {
        expenseId: id, projectId: editing.projectId,
        projectName: proj?.projectName || editing.projectName,
        amount: editing.amount, expenseType: editing.expenseType,
        vendorName: editing.vendorName, date: editing.date,
        description: editing.description, billUrl,
        createdAt: Date.now(), createdBy: user.uid, createdByEmail: user.email,
      };

      if (editing.expenseId) {
        await updateDoc(doc(db, "expenses", id), { ...data });
        await logActivity(user, "UPDATED_EXPENSE", { expenseId: id, amount: data.amount, projectId: data.projectId });
      } else {
        await setDoc(doc(db, "expenses", id), data);
        // Notification
        await setDoc(doc(db, "notifications", crypto.randomUUID()), {
          notifId: crypto.randomUUID(), type: "expense_added",
          title: "Expense Added",
          message: `${fmt(data.amount)} ${EXPENSE_TYPE_LABELS[data.expenseType]} expense added for "${data.projectName}".`,
          read: false, createdAt: Date.now(), projectId: editing.projectId,
        });
        await logActivity(user, "CREATED_EXPENSE", { expenseId: id, amount: data.amount, projectId: data.projectId });
      }
      toast.success(editing.expenseId ? "Expense updated" : "Expense recorded");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense record?")) return;
    await deleteDoc(doc(getDb(), "expenses", id));
    await logActivity(user, "DELETED_EXPENSE", { expenseId: id });
    toast.success("Deleted");
    await load();
  };

  const totalExpenses = records.reduce((s, r) => s + r.amount, 0);
  const thisMonth = records
    .filter((r) => r.date.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, r) => s + r.amount, 0);

  // Breakdown by type
  const byType = (Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map((t) => ({
    type: t,
    total: records.filter((r) => r.expenseType === t).reduce((s, r) => s + r.amount, 0),
  })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchQ = !q || r.projectName.toLowerCase().includes(q)
      || r.vendorName.toLowerCase().includes(q)
      || r.description.toLowerCase().includes(q);
    const matchT = typeFilter === "all" || r.expenseType === typeFilter;
    const matchP = projectFilter === "all" || r.projectId === projectFilter;
    return matchQ && matchT && matchP;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track all project expenditures.</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY, _file: null })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Expense
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="inline-flex rounded-lg bg-red-500/10 p-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
          </div>
          <div className="mt-3 text-2xl font-bold">{fmtCompact(totalExpenses)}</div>
          <div className="text-sm text-muted-foreground">Total Expenses</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="inline-flex rounded-lg bg-orange-500/10 p-2">
            <TrendingDown className="h-5 w-5 text-orange-500" />
          </div>
          <div className="mt-3 text-2xl font-bold">{fmtCompact(thisMonth)}</div>
          <div className="text-sm text-muted-foreground">This Month</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium text-muted-foreground mb-2">By Type</div>
          <div className="space-y-1.5">
            {byType.slice(0, 3).map((x) => (
              <div key={x.type} className="flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs ${EXPENSE_TYPE_COLORS[x.type]}`}>
                  {EXPENSE_TYPE_LABELS[x.type]}
                </span>
                <span className="text-xs font-medium">{fmtCompact(x.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project, vendor…"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="all">All Types</option>
          {(Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map((t) => (
            <option key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 hidden sm:table-cell">Vendor</th>
              <th className="px-4 py-3 hidden md:table-cell">Date</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No expense records found.</td></tr>}
            {filtered.map((r) => (
              <tr key={r.expenseId} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">{r.projectName}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EXPENSE_TYPE_COLORS[r.expenseType]}`}>
                    {EXPENSE_TYPE_LABELS[r.expenseType]}
                  </span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{r.vendorName || "—"}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{r.date}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">{fmt(r.amount)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    {r.billUrl && (
                      <a href={r.billUrl} target="_blank" rel="noopener noreferrer"
                        className="rounded-md p-1.5 hover:bg-accent text-blue-500">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button onClick={() => setEditing({ ...r, _file: null })}
                      className="rounded-md p-1.5 hover:bg-accent"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => remove(r.expenseId)}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">{editing.expenseId ? "Edit Expense" : "Add Expense"}</h2>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                <F label="Project *" span={2}>
                  <select value={editing.projectId}
                    onChange={(e) => setEditing({ ...editing, projectId: e.target.value })}
                    className="input">
                    <option value="">Select Project…</option>
                    {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}</option>)}
                  </select>
                </F>
                <F label="Amount (₹) *">
                  <input type="number" min={0} value={editing.amount}
                    onChange={(e) => setEditing({ ...editing, amount: +e.target.value })}
                    className="input" />
                </F>
                <F label="Date">
                  <input type="date" value={editing.date}
                    onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                    className="input" />
                </F>
                <F label="Expense Type">
                  <select value={editing.expenseType}
                    onChange={(e) => setEditing({ ...editing, expenseType: e.target.value as ExpenseType })}
                    className="input">
                    {(Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map((t) => (
                      <option key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </F>
                <F label="Vendor Name">
                  <input value={editing.vendorName}
                    onChange={(e) => setEditing({ ...editing, vendorName: e.target.value })}
                    className="input" placeholder="Vendor / Supplier" />
                </F>
                <F label="Description" span={2}>
                  <textarea value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    rows={2} className="input" />
                </F>
                <F label="Upload Bill / Receipt" span={2}>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setEditing({ ...editing, _file: e.target.files?.[0] ?? null })}
                    className="hidden" />
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-input px-4 py-3 text-sm hover:bg-accent w-full">
                    <FileUp className="h-4 w-4 text-muted-foreground" />
                    {editing._file ? editing._file.name : editing.billUrl ? "Replace bill" : "Choose file (PDF / Image)"}
                  </button>
                </F>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <button onClick={() => setEditing(null)}
                className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button onClick={save} disabled={uploading}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {uploading ? "Saving…" : "Save"}
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
