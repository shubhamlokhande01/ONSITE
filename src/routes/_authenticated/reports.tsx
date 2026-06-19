import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Download } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { exportCsv, formatTime } from "@/lib/geo";
import type { Employee, Task, AttendanceRecord } from "@/lib/firestore-types";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.navigate({ to: "/dashboard" });
    }
  }, [user, router]);

  const exportEmployees = async () => {
    setBusy("emp");
    const snap = await getDocs(collection(getDb(), "employees"));
    const rows = snap.docs.map((d) => d.data() as Employee);
    exportCsv("employees.csv", rows as unknown as Record<string, unknown>[]);
    setBusy(null);
  };

  const exportTasks = async () => {
    setBusy("task");
    const snap = await getDocs(collection(getDb(), "tasks"));
    const rows = snap.docs.map((d) => {
      const t = d.data() as Task;
      return {
        taskId: d.id,
        title: t.title,
        assignedToName: t.assignedToName,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
      };
    });
    exportCsv("tasks.csv", rows);
    setBusy(null);
  };

  const exportAttendance = async () => {
    setBusy("att");
    const snap = await getDocs(collection(getDb(), "attendance"));
    const rows = snap.docs.map((d) => {
      const a = d.data() as AttendanceRecord;
      return {
        date: a.date,
        employeeId: a.employeeId,
        checkIn: formatTime(a.checkInTime),
        checkOut: formatTime(a.checkOutTime),
        checkInLat: a.checkInLat ?? "",
        checkInLng: a.checkInLng ?? "",
      };
    });
    exportCsv("attendance.csv", rows);
    setBusy(null);
  };

  const reports = [
    {
      key: "emp",
      title: "Employee Report",
      desc: "All employees with departments, designations and status.",
      action: exportEmployees,
    },
    {
      key: "task",
      title: "Task Report",
      desc: "All tasks with assignees, priorities and statuses.",
      action: exportTasks,
    },
    {
      key: "att",
      title: "Attendance Report",
      desc: "All check-in/out records with GPS coordinates.",
      action: exportAttendance,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Export operational data as CSV.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {reports.map((r) => (
          <div
            key={r.key}
            className="rounded-lg border border-border bg-card p-6"
          >
            <h3 className="font-semibold">{r.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
            <button
              onClick={r.action}
              disabled={busy === r.key}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {busy === r.key ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}