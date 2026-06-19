import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Camera, Upload } from "lucide-react";
import { toast } from "sonner";
import { getDb, getStorageRef } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { getCurrentPosition } from "@/lib/geo";
import type { FieldPhoto } from "@/lib/firestore-types";
import { logActivity } from "@/lib/activity-logger";

export const Route = createFileRoute("/_authenticated/photos")({
  component: PhotosPage,
});

function PhotosPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FieldPhoto[]>([]);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const db = getDb();
    const q =
      user.role === "admin"
        ? query(collection(db, "photos"), orderBy("createdAt", "desc"))
        : query(
            collection(db, "photos"),
            where("employeeId", "==", user.uid),
          );
    try {
      const snap = await getDocs(q);
      setItems(
        snap.docs
          .map((d) => ({ ...(d.data() as FieldPhoto), id: d.id }))
          .sort((a, b) => b.createdAt - a.createdAt),
      );
    } catch {
      // missing index
      const snap = await getDocs(collection(db, "photos"));
      setItems(
        snap.docs
          .map((d) => ({ ...(d.data() as FieldPhoto), id: d.id }))
          .filter((p) => user.role === "admin" || p.employeeId === user.uid)
          .sort((a, b) => b.createdAt - a.createdAt),
      );
    }
  };

  useEffect(() => {
    void load();
  }, [user]);

  const upload = async () => {
    if (!user || !file) {
      toast.error("Select a file first");
      return;
    }
    if (!/\.(jpe?g|png)$/i.test(file.name)) {
      toast.error("Only JPG/PNG allowed");
      return;
    }
    setBusy(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await getCurrentPosition();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // optional
      }
      const path = `field-photos/${user.uid}/${Date.now()}_${file.name}`;
      const r = ref(getStorageRef(), path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await addDoc(collection(getDb(), "photos"), {
        employeeId: user.uid,
        employeeName: user.fullName ?? user.email,
        url,
        caption,
        createdAt: Date.now(),
        lat,
        lng,
        uploadedByEmail: user.email,
      });
      await logActivity(user, "UPLOADED_PHOTO", { caption, lat, lng });
      toast.success("Uploaded");
      setCaption("");
      setFile(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Field Photos</h1>
        <p className="text-sm text-muted-foreground">
          Upload proof-of-work photos from the field.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="input"
          />
          <input
            placeholder="Caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="input md:col-span-1"
          />
          <button
            onClick={upload}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-sm text-muted-foreground">
            <Camera className="mb-2 h-8 w-8" />
            No photos yet.
          </div>
        )}
        {items.map((p) => (
          <div
            key={p.id}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <img
              src={p.url}
              alt={p.caption}
              className="aspect-square w-full object-cover"
            />
            <div className="p-3">
              <div className="text-sm font-medium line-clamp-1">
                {p.caption || "Untitled"}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.employeeName} · {new Date(p.createdAt).toLocaleDateString()}
              </div>
              {p.lat && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                  className="mt-1 text-xs text-primary hover:underline"
                >
                  View location
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}