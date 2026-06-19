import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { getDb } from "@/lib/firebase";
import type { Task, Employee } from "@/lib/firestore-types";
import { useAuth } from "@/lib/auth-context";
import { logActivity } from "@/lib/activity-logger";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

const STATUS_LABELS: Record<Task["status"], string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const PRIORITY_COLOR: Record<Task["priority"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-chart-4/15 text-chart-4",
  high: "bg-destructive/15 text-destructive",
};

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignedTo: "",
    priority: "medium" as Task["priority"],
    dueDate: new Date().toISOString().split("T")[0],
  });

  const load = async () => {
    setLoading(true);
    const db = getDb();
    const [tSnap, eSnap] = await Promise.all([
      getDocs(collection(db, "tasks")),
      getDocs(collection(db, "employees")),
    ]);
    setTasks(
      tSnap.docs.map((d) => ({ ...(d.data() as Task), taskId: d.id })),
    );
    setEmployees(
      eSnap.docs.map((d) => ({ ...(d.data() as Employee), employeeId: d.id })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!form.title || !form.assignedTo) {
      toast.error("Title and assignee required");
      return;
    }
    const assignee = employees.find((e) => e.employeeId === form.assignedTo);
    try {
      await addDoc(collection(getDb(), "tasks"), {
        ...form,
        assignedToName: assignee?.fullName ?? "",
        status: "pending",
        createdAt: Date.now(),
        createdBy: user?.uid ?? "",
        createdByEmail: user?.email ?? "",
        createdAtServer: serverTimestamp(),
      });
      await logActivity(user, "CREATED_TASK", { title: form.title, assignedTo: assignee?.fullName });
      toast.success("Task created");
      setCreating(false);
      setForm({
        title: "",
        description: "",
        assignedTo: "",
        priority: "medium",
        dueDate: new Date().toISOString().split("T")[0],
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const updateStatus = async (t: Task, status: Task["status"]) => {
    await updateDoc(doc(getDb(), "tasks", t.taskId), { status, updatedByEmail: user?.email });
    await logActivity(user, "UPDATED_TASK_STATUS", { taskId: t.taskId, status });
    toast.success("Status updated");
    await load();
  };

  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (user?.role !== "admin") {
      list = list.filter((t) => t.assignedTo === user?.uid);
    }
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (q) {
      const ql = q.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(ql) ||
          t.description.toLowerCase().includes(ql) ||
          t.assignedToName?.toLowerCase().includes(ql),
      );
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks, q, statusFilter, user]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {user?.role === "admin"
              ? "Create and assign tasks to your team."
              : "Your assigned work."}
          </p>
        </div>
        {user?.role === "admin" && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New task
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks…"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {loading && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
        {!loading && visibleTasks.length === 0 && (
          <div className="text-sm text-muted-foreground">No tasks.</div>
        )}
        {visibleTasks.map((t) => (
          <div
            key={t.taskId}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{t.title}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_COLOR[t.priority]}`}
              >
                {t.priority}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-3">
              {t.description}
            </p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div>Assigned to: {t.assignedToName || "—"}</div>
              <div>Due: {t.dueDate}</div>
            </div>
            <select
              value={t.status}
              onChange={(e) => updateStatus(t, e.target.value as Task["status"])}
              className="mt-3 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCreating(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-lg border border-border bg-card p-6"
          >
            <h2 className="text-lg font-semibold">New task</h2>
            <div className="mt-4 space-y-3">
              <input
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="input"
              />
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input min-h-24"
              />
              <select
                value={form.assignedTo}
                onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                className="input"
              >
                <option value="">Assign to…</option>
                {employees.map((e) => (
                  <option key={e.employeeId} value={e.employeeId}>
                    {e.fullName} ({e.email})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value as Task["priority"] })
                  }
                  className="input"
                >
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority</option>
                </select>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={create}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}