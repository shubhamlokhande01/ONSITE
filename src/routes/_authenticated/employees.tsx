import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { Pencil, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { getDb } from "@/lib/firebase";
import type { Employee } from "@/lib/firestore-types";
import { useAuth } from "@/lib/auth-context";
import { logActivity } from "@/lib/activity-logger";

export const Route = createFileRoute("/_authenticated/employees")({
  component: EmployeesPage,
});

const EMPTY: Employee = {
  employeeId: "",
  fullName: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  joiningDate: new Date().toISOString().split("T")[0],
  status: "active",
  profileImage: "",
};

function EmployeesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<Employee | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.navigate({ to: "/dashboard" });
    }
  }, [user, router]);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(collection(getDb(), "employees"));
    setItems(snap.docs.map((d) => ({ ...(d.data() as Employee), employeeId: d.id })));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!editing) return;
    try {
      const db = getDb();
      if (editing.employeeId && items.find((i) => i.employeeId === editing.employeeId)) {
        const { employeeId, ...rest } = editing;
        await updateDoc(doc(db, "employees", employeeId), rest);
        await logActivity(user, "UPDATED_EMPLOYEE", { employeeId, fullName: editing.fullName });
        toast.success("Employee updated");
      } else {
        const id = editing.employeeId || crypto.randomUUID();
        await setDoc(doc(db, "employees", id), { ...editing, employeeId: id, createdByEmail: user?.email });
        await logActivity(user, "CREATED_EMPLOYEE", { employeeId: id, fullName: editing.fullName });
        toast.success("Employee added");
      }
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this employee?")) return;
    await deleteDoc(doc(getDb(), "employees", id));
    await logActivity(user, "DELETED_EMPLOYEE", { employeeId: id });
    toast.success("Deleted");
    await load();
  };

  const filtered = items.filter((e) => {
    const matchQ =
      !q ||
      e.fullName.toLowerCase().includes(q.toLowerCase()) ||
      e.email.toLowerCase().includes(q.toLowerCase()) ||
      e.department.toLowerCase().includes(q.toLowerCase());
    const matchS = statusFilter === "all" || e.status === statusFilter;
    return matchQ && matchS;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-sm text-muted-foreground">
            Manage your team members.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add employee
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, department…"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 hidden md:table-cell">Department</th>
              <th className="px-4 py-3 hidden md:table-cell">Designation</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No employees yet.
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr key={e.employeeId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{e.fullName}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.email}</td>
                <td className="px-4 py-3 hidden md:table-cell">{e.department || "—"}</td>
                <td className="px-4 py-3 hidden md:table-cell">{e.designation || "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      e.status === "active"
                        ? "bg-chart-2/15 text-chart-2"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditing(e)}
                    className="mr-2 rounded-md p-1.5 hover:bg-accent"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(e.employeeId)}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-lg border border-border bg-card p-6"
          >
            <h2 className="text-lg font-semibold">
              {editing.employeeId ? "Edit employee" : "Add employee"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Full name">
                <input
                  value={editing.fullName}
                  onChange={(e) => setEditing({ ...editing, fullName: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Email">
                <input
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Department">
                <input
                  value={editing.department}
                  onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Designation">
                <input
                  value={editing.designation}
                  onChange={(e) => setEditing({ ...editing, designation: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Joining date">
                <input
                  type="date"
                  value={editing.joiningDate}
                  onChange={(e) => setEditing({ ...editing, joiningDate: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Status">
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value as Employee["status"] })
                  }
                  className="input"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}