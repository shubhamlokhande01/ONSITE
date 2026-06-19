import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Plus, Search, Trash2, X, FileText, Image, Download, ExternalLink, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { getDb, getStorageRef } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Project } from "@/lib/project-types";
import { type ProjectDocument, type DocCategory, DOC_CATEGORY_LABELS } from "@/lib/project-types";
import { logActivity } from "@/lib/activity-logger";

export const Route = createFileRoute("/_authenticated/documents")({
  component: DocumentsPage,
});

const DOC_CATEGORY_COLORS: Record<DocCategory, string> = {
  contract: "bg-blue-500/15 text-blue-600",
  quotation: "bg-purple-500/15 text-purple-600",
  bill: "bg-red-500/15 text-red-600",
  invoice: "bg-emerald-500/15 text-emerald-600",
  image: "bg-amber-500/15 text-amber-600",
  other: "bg-gray-500/15 text-gray-600",
};

function DocumentsPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ projectId: "", name: "", category: "other" as DocCategory });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [docSnap, projSnap] = await Promise.all([
        getDocs(collection(getDb(), "documents")),
        getDocs(collection(getDb(), "projects")),
      ]);
      setDocs(docSnap.docs.map((d) => ({ ...(d.data() as ProjectDocument), docId: d.id }))
        .sort((a, b) => b.uploadedAt - a.uploadedAt));
      setProjects(projSnap.docs.map((d) => ({ ...(d.data() as Project), projectId: d.id })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const upload = async () => {
    if (!file || !user) return;
    if (!form.projectId) { toast.error("Select a project"); return; }
    try {
      setUploading(true);
      const id = crypto.randomUUID();
      const storageRef = ref(getStorageRef(), `documents/${id}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const proj = projects.find((p) => p.projectId === form.projectId);
      const data: ProjectDocument = {
        docId: id, projectId: form.projectId,
        projectName: proj?.projectName || "",
        name: form.name || file.name,
        category: form.category,
        url, fileType: file.type, fileSize: file.size,
        uploadedAt: Date.now(), uploadedBy: user.uid,
        uploadedByName: user.fullName || user.email,
        uploadedByEmail: user.email,
      };
      await setDoc(doc(getDb(), "documents", id), data);
      await logActivity(user, "UPLOADED_DOCUMENT", { docId: id, name: data.name, projectId: data.projectId });
      toast.success("Document uploaded");
      setShowModal(false);
      setFile(null);
      setForm({ projectId: "", name: "", category: "other" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (docId: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await deleteDoc(doc(getDb(), "documents", docId));
    await logActivity(user, "DELETED_DOCUMENT", { docId, name });
    toast.success("Deleted");
    await load();
  };

  const filtered = docs.filter((d) => {
    const q = search.toLowerCase();
    const matchQ = !q || d.name.toLowerCase().includes(q) || d.projectName.toLowerCase().includes(q);
    const matchC = categoryFilter === "all" || d.category === categoryFilter;
    const matchP = projectFilter === "all" || d.projectId === projectFilter;
    return matchQ && matchC && matchP;
  });

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const getFileIcon = (fileType: string, category: DocCategory) => {
    if (category === "image" || fileType.startsWith("image/")) return Image;
    return FileText;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground">Contracts, quotations, bills, invoices & project files.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Upload Document
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map((cat) => {
          const count = docs.filter((d) => d.category === cat).length;
          return (
            <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? "all" : cat)}
              className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${categoryFilter === cat ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
              <div className={`inline-flex rounded-md px-2 py-0.5 text-xs ${DOC_CATEGORY_COLORS[cat]}`}>
                {DOC_CATEGORY_LABELS[cat]}
              </div>
              <div className="mt-2 text-xl font-bold">{count}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}</option>)}
        </select>
      </div>

      {/* Document Grid */}
      {loading && <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">No documents found. Upload your first document.</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((d) => {
          const Icon = getFileIcon(d.fileType, d.category);
          return (
            <div key={d.docId} className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow">
              <div className={`shrink-0 rounded-lg p-2.5 ${DOC_CATEGORY_COLORS[d.category]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{d.name}</div>
                <div className="text-xs text-muted-foreground truncate">{d.projectName}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${DOC_CATEGORY_COLORS[d.category]}`}>
                    {DOC_CATEGORY_LABELS[d.category]}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatSize(d.fileSize)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(d.uploadedAt).toLocaleDateString("en-IN")}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  className="rounded-md p-1 hover:bg-accent text-blue-500">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button onClick={() => remove(d.docId, d.name)}
                  className="rounded-md p-1 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowModal(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Upload Document</h2>
              <button onClick={() => setShowModal(false)} className="rounded-md p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Project *</span>
                <select value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  className="input">
                  <option value="">Select Project…</option>
                  {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Document Name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Leave blank to use filename"
                  className="input" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Category</span>
                <select value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as DocCategory })}
                  className="input">
                  {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map((c) => (
                    <option key={c} value={c}>{DOC_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </label>
              <div>
                <input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-input py-8 hover:bg-accent transition-colors">
                  <div className="text-center">
                    <Download className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    {file ? (
                      <span className="text-sm font-medium">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Click to choose file or drag & drop</span>
                    )}
                  </div>
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <button onClick={() => setShowModal(false)}
                className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button onClick={upload} disabled={!file || uploading}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
