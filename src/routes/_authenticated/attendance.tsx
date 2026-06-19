import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { MapPin, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { getCurrentPosition, todayKey, formatTime } from "@/lib/geo";
import type { AttendanceRecord } from "@/lib/firestore-types";
import { logActivity } from "@/lib/activity-logger";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const { user } = useAuth();
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const db = getDb();
    const docId = `${user.uid}_${todayKey()}`;
    const todaySnap = await getDoc(doc(db, "attendance", docId));
    setToday(todaySnap.exists() ? (todaySnap.data() as AttendanceRecord) : null);

    const q =
      user.role === "admin"
        ? query(collection(db, "attendance"), orderBy("date", "desc"))
        : query(
            collection(db, "attendance"),
            where("employeeId", "==", user.uid),
            orderBy("date", "desc"),
          );
    try {
      const histSnap = await getDocs(q);
      setHistory(
        histSnap.docs.map((d) => ({ ...(d.data() as AttendanceRecord), id: d.id })),
      );
    } catch {
      // composite index may be missing; fall back without order
      const fallback =
        user.role === "admin"
          ? collection(db, "attendance")
          : query(collection(db, "attendance"), where("employeeId", "==", user.uid));
      const histSnap = await getDocs(fallback);
      setHistory(
        histSnap.docs.map((d) => ({ ...(d.data() as AttendanceRecord), id: d.id })),
      );
    }
  };

  useEffect(() => {
    void load();
  }, [user]);

  const checkIn = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      const date = todayKey();
      const record: AttendanceRecord = {
        employeeId: user.uid,
        date,
        checkInTime: Date.now(),
        checkInLat: pos.coords.latitude,
        checkInLng: pos.coords.longitude,
      };
      await setDoc(doc(getDb(), "attendance", `${user.uid}_${date}`), { ...record, recordedByEmail: user.email });
      await logActivity(user, "MARKED_ATTENDANCE", { date, type: "check-in" });
      toast.success("Checked in");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    if (!user || !today) return;
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      await updateDoc(doc(getDb(), "attendance", `${user.uid}_${todayKey()}`), {
        checkOutTime: Date.now(),
        checkOutLat: pos.coords.latitude,
        checkOutLng: pos.coords.longitude,
        recordedByEmail: user.email,
      });
      await logActivity(user, "MARKED_ATTENDANCE", { date: todayKey(), type: "check-out" });
      toast.success("Checked out");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          GPS-verified check in / out.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Today</div>
            <div className="text-2xl font-semibold">{todayKey()}</div>
            <div className="mt-3 flex gap-6 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Check in</div>
                <div className="font-medium">{formatTime(today?.checkInTime)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Check out</div>
                <div className="font-medium">{formatTime(today?.checkOutTime)}</div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={checkIn}
              disabled={busy || !!today?.checkInTime}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" /> Check in
            </button>
            <button
              onClick={checkOut}
              disabled={busy || !today?.checkInTime || !!today?.checkOutTime}
              className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> Check out
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold">
          {user?.role === "admin" ? "All attendance" : "Your history"}
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Date</th>
              {user?.role === "admin" && <th className="px-4 py-2">Employee</th>}
              <th className="px-4 py-2">In</th>
              <th className="px-4 py-2">Out</th>
              <th className="px-4 py-2 hidden md:table-cell">Location</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No records.
                </td>
              </tr>
            )}
            {history.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2">{r.date}</td>
                {user?.role === "admin" && (
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.employeeId.slice(0, 8)}…
                  </td>
                )}
                <td className="px-4 py-2">{formatTime(r.checkInTime)}</td>
                <td className="px-4 py-2">{formatTime(r.checkOutTime)}</td>
                <td className="px-4 py-2 hidden md:table-cell text-xs text-muted-foreground">
                  {r.checkInLat ? (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={`https://www.google.com/maps?q=${r.checkInLat},${r.checkInLng}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <MapPin className="h-3 w-3" />
                      {r.checkInLat.toFixed(4)}, {r.checkInLng?.toFixed(4)}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}