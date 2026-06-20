"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Paperclip, Upload, FileText, Image as ImageIcon, Trash2,
    Loader2, Download, Eye, X, ChevronDown,
} from "lucide-react";
import {
    uploadVisitAttachment, listVisitAttachments,
    getAttachmentSignedUrl, deleteVisitAttachment,
} from "@/lib/actions/visit-attachments";

interface Attachment {
    id: string;
    category: string;
    file_name: string;
    file_path: string;
    file_size: number | null;
    mime_type: string | null;
    note: string | null;
    uploaded_at: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profiles?: any;
}

const CATEGORY_LABELS: Record<string, string> = {
    opd_record: "เวชระเบียน OPD",
    lab_external: "ผลแลบจากภายนอก",
    lab_internal: "ผลแลบในคลินิก",
    imaging: "ภาพถ่ายรังสี (X-ray)",
    consent: "ใบยินยอม",
    referral_doc: "เอกสารส่งต่อ",
    prescription: "ใบสั่งยา",
    med_cert: "ใบรับรองแพทย์",
    other: "อื่นๆ",
};

const CATEGORY_COLOR: Record<string, string> = {
    opd_record: "bg-blue-100 text-blue-700",
    lab_external: "bg-purple-100 text-purple-700",
    lab_internal: "bg-violet-100 text-violet-700",
    imaging: "bg-cyan-100 text-cyan-700",
    consent: "bg-emerald-100 text-emerald-700",
    referral_doc: "bg-orange-100 text-orange-700",
    prescription: "bg-pink-100 text-pink-700",
    med_cert: "bg-amber-100 text-amber-700",
    other: "bg-slate-100 text-slate-700",
};

function formatSize(bytes: number | null) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function AttachmentsManager({ vn, hn }: { vn: string; hn: string }) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [category, setCategory] = useState("opd_record");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [dragOver, setDragOver] = useState(false);

    async function load() {
        setLoading(true);
        const res = await listVisitAttachments(vn);
        if (res.success) setItems(res.data as Attachment[]);
        setLoading(false);
    }

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vn]);

    async function handleFile(file: File) {
        setError("");
        setUploading(true);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("vn", vn);
        fd.append("hn", hn);
        fd.append("category", category);
        if (note) fd.append("note", note);

        const res = await uploadVisitAttachment(fd);
        setUploading(false);

        if (!res.success) { setError(res.error || "อัปโหลดไม่สำเร็จ"); return; }
        setNote("");
        setShowForm(false);
        await load();
        router.refresh();
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    async function handleView(filePath: string) {
        const res = await getAttachmentSignedUrl(filePath);
        if (res.success && res.url) window.open(res.url, "_blank");
        else alert(res.error || "ไม่สามารถเปิดไฟล์ได้");
    }

    async function handleDelete(id: string, name: string) {
        if (!confirm(`ลบไฟล์ "${name}"?`)) return;
        const res = await deleteVisitAttachment(id, vn, hn);
        if (!res.success) { alert(res.error || "ลบไม่สำเร็จ"); return; }
        await load();
        router.refresh();
    }

    return (
        <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            <div className="bg-blue-50/40 border-b px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-blue-600" />
                    <h3 className="font-semibold text-slate-700 text-sm">ไฟล์แนบ ({items.length})</h3>
                </div>
                {!showForm && (
                    <Button size="sm" variant="outline" className="rounded-lg gap-1.5 h-8 text-xs"
                        onClick={() => setShowForm(true)}>
                        <Upload className="h-3.5 w-3.5" /> เพิ่มไฟล์
                    </Button>
                )}
            </div>

            {/* Upload form */}
            {showForm && (
                <div className="p-4 bg-blue-50/20 border-b space-y-3">
                    {error && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">{error}</p>}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500">หมวดหมู่</label>
                            <div className="relative">
                                <select value={category} onChange={e => setCategory(e.target.value)}
                                    className="flex h-9 w-full appearance-none rounded-lg border border-border/60 bg-white pl-3 pr-8 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                                        <option key={v} value={v}>{l}</option>
                                    ))}
                                </select>
                                <ChevronDown className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500">หมายเหตุ (optional)</label>
                            <input value={note} onChange={e => setNote(e.target.value)}
                                placeholder="เช่น ผล CBC, EKG..."
                                className="flex h-9 w-full rounded-lg border border-border/60 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                    </div>

                    {/* Drag-drop zone */}
                    <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        onClick={() => fileRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                            dragOver ? "border-blue-500 bg-blue-100/40"
                                : uploading ? "border-blue-200 bg-blue-50/30"
                                : "border-slate-300 bg-slate-50/30 hover:bg-slate-100/40"
                        }`}
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="h-8 w-8 text-blue-500 mx-auto mb-2 animate-spin" />
                                <p className="text-sm text-slate-600">กำลังอัปโหลด...</p>
                            </>
                        ) : (
                            <>
                                <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                                <p className="text-sm text-slate-600">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
                                <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG · สูงสุด 10MB</p>
                            </>
                        )}
                        <input
                            ref={fileRef} type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setError(""); }}
                            className="rounded-lg gap-1.5 text-xs">
                            <X className="h-3.5 w-3.5" /> ยกเลิก
                        </Button>
                    </div>
                </div>
            )}

            {/* File list */}
            <div className="p-3">
                {loading ? (
                    <div className="flex items-center justify-center py-8 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        <span className="text-sm">กำลังโหลด...</span>
                    </div>
                ) : items.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">ยังไม่มีไฟล์แนบ</p>
                ) : (
                    <div className="space-y-1.5">
                        {items.map(att => {
                            const isImage = att.mime_type?.startsWith("image/");
                            const Icon = isImage ? ImageIcon : FileText;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const uploader = Array.isArray((att as any).profiles) ? (att as any).profiles[0] : (att as any).profiles;
                            return (
                                <div key={att.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50/60 border border-slate-200/50 group hover:bg-slate-100/60 transition-colors">
                                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isImage ? "bg-cyan-100 text-cyan-700" : "bg-red-100 text-red-700"}`}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-slate-800 truncate">{att.file_name}</span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${CATEGORY_COLOR[att.category] || "bg-slate-100 text-slate-600"}`}>
                                                {CATEGORY_LABELS[att.category] || att.category}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                            <span>{formatSize(att.file_size)}</span>
                                            <span>·</span>
                                            <span>{new Date(att.uploaded_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
                                            {uploader?.full_name && (
                                                <>
                                                    <span>·</span>
                                                    <span>{uploader.full_name}</span>
                                                </>
                                            )}
                                            {att.note && (
                                                <>
                                                    <span>·</span>
                                                    <span className="italic">{att.note}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => handleView(att.file_path)}
                                            className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600" title="ดู/ดาวน์โหลด">
                                            <Eye className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => handleView(att.file_path)}
                                            className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 hidden sm:inline-block" title="ดาวน์โหลด">
                                            <Download className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => handleDelete(att.id, att.file_name)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-100 text-red-500" title="ลบ">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
