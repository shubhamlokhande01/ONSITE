import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  collection, deleteDoc, doc, getDocs, setDoc, updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Plus, Search, Pencil, Trash2, X, TrendingUp, Receipt, FileUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getDb, getStorageRef } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Project } from "@/lib/project-types";
import { type IncomeRecord, type PaymentMethod, PAYMENT_METHOD_LABELS, fmt, fmtCompact } from "@/lib/project-types";

export const Route = createFileRoute("/_authenticated/income")({
  component: IncomePage,
});

const EMPTY: Omit<IncomeRecord, "incomeId" | "createdAt" | "createdBy"> = {
  projectId: "", projectName: "", amount: 0,
  paymentDate: new Date().toISOString().split("T")[0],
  paymentMethod: "bank_transfer", category: "Project Payment",
  description: "", invoiceUrl: "",
};

type FormData = typeof EMPTY & { incomeId?: string; _file?: File | null };

const INCOME_CATEGORIES = [
  "Project Payment", "Advance Payment", "Milestone Payment",
  "Final Payment", "Service Charge", "Consultation Fee", "Other",
];

function IncomePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [editing, setEditing] = useState<FormData | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [incSnap, projSnap] = await Promise.all([
        getDocs(collection(getDb(), "income")),
        getDocs(collection(getDb(), "projects")),
      ]);
      setRecords(incSnap.docs.map((d) => ({ ...(d.data() as IncomeRecord), incomeId: d.id }))
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
      const id = editing.incomeId || crypto.randomUUID();
      let invoiceUrl = editing.invoiceUrl || "";

      if (editing._file) {
        const storageRef = ref(getStorageRef(), `invoices/${id}/${editing._file.name}`);
        await uploadBytes(storageRef, editing._file);
        invoiceUrl = await getDownloadURL(storageRef);
      }

      const proj = projects.find((p) => p.projectId === editing.projectId);
      const data: IncomeRecord = {
        incomeId: id, projectId: editing.projectId,
        projectName: proj?.projectName || editing.projectName,
        amount: editing.amount, paymentDate: editing.paymentDate,
        paymentMethod: editing.paymentMethod, category: editing.category,
        description: editing.description, invoiceUrl,
        createdAt: Date.now(), createdBy: user.uid,
      };

      if (editing.incomeId) {
        await updateDoc(doc(db, "income", id), { ...data });
      } else {
        await setDoc(doc(db, "income", id), data);
        // Notification
        await setDoc(doc(db, "notifications", crypto.randomUUID()), {
          notifId: crypto.randomUUID(), type: "payment_received",
          title: "Payment Received",
          message: `${fmt(data.amount)} received for "${data.projectName}" via ${PAYMENT_METHOD_LABELS[data.paymentMethod]}.`,
          read: false, createdAt: Date.now(), projectId: editing.projectId,
        });
      }
      toast.success(editing.incomeId ? "Income updated" : "Income recorded");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this income record?")) return;
    await deleteDoc(doc(getDb(), "income", id));
    toast.success("Deleted");
    await load();
  };

  const totalIncome = records.reduce((s, r) => s + r.amount, 0);
  const thisMonth = records.filter((r) => r.paymentDate.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, r) => s + r.amount, 0);

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchQ = !q || r.projectName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    const matchM = methodFilter === "all" || r.paymentMethod === methodFilter;
    const matchP = projectFilter === "all" || r.projectId === projectFilter;
    return matchQ && matchM && matchP;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Income</h1>
          <p className="text-sm text-muted-foreground">Track all payment receipts.</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY, _file: null })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Record Income
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={TrendingUp} label="Total Income" value={fmtCompact(totalIncome)} color="text-emerald-500" bg="bg-emerald-500/10" />
        <KpiCard icon={Receipt} label="This Month" value={fmtCompact(thisMonth)} color="text-blue-500" bg="bg-blue-500/10" />
        <KpiCard icon={Receipt} label="Records" value={String(records.length)} color="text-purple-500" bg="bg-purple-500/10" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search income records…"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}</option>)}
        </select>
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="all">All Methods</option>
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 hidden sm:table-cell">Method</th>
              <th className="px-4 py-3 hidden md:table-cell">Date</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No income records found.</td></tr>}
            {filtered.map((r) => (
              <tr key={r.incomeId} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">{r.projectName}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.category}</td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                    {PAYMENT_METHOD_LABELS[r.paymentMethod]}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{r.paymentDate}</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(r.amount)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    {r.invoiceUrl && (
                      <a href={r.invoiceUrl} target="_blank" rel="noopener noreferrer"
                        className="rounded-md p-1.5 hover:bg-accent text-blue-500">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button onClick={() => setEditing({ ...r, _file: null })}
                      className="rounded-md p-1.5 hover:bg-accent"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => remove(r.incomeId)}
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
              <h2 className="text-lg font-semibold">{editing.incomeId ? "Edit Income" : "Record Income"}</h2>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
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
                <F label="Payment Date">
                  <input type="date" value={editing.paymentDate}
                    onChange={(e) => setEditing({ ...editing, paymentDate: e.target.value })}
                    className="input" />
                </F>
                <F label="Payment Method">
                  <select value={editing.paymentMethod}
                    onChange={(e) => setEditing({ ...editing, paymentMethod: e.target.value as PaymentMethod })}
                    className="input">
                    {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                    ))}
                  </select>
                </F>
                <F label="Category">
                  <select value={editing.category}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    className="input">
                    {INCOME_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </F>
                <F label="Description" span={2}>
                  <textarea value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    rows={2} className="input" />
                </F>
                <F label="Upload Invoice" span={2}>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setEditing({ ...editing, _file: e.target.files?.[0] ?? null })}
                    className="hidden" />
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-input px-4 py-3 text-sm hover:bg-accent w-full">
                    <FileUp className="h-4 w-4 text-muted-foreground" />
                    {editing._file ? editing._file.name : editing.invoiceUrl ? "Replace invoice" : "Choose file (PDF / Image)"}
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

function KpiCard({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: string; color: string; bg: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className={`inline-flex rounded-lg p-2 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
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
