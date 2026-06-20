"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Paperclip, Upload, FileText, Image as ImageIcon, Trash2,
    Loader2, Eye, ChevronDown, Calendar, ExternalLink,
} from "lucide-react";
import {
    uploadVisitAttachment, listPatientAttachments,
    getAttachmentSignedUrl, deleteVisitAttachment,
} from "@/lib/actions/visit-attachments";

interface Attachment {
    id: string;
    vn: string;
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

interface VisitOption {
    vn: string;
    visit_date: string;
    chief_complaint: string | null;
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

export default function PatientAttachmentsTab({
    hn, visits,
}: {
    hn: string;
    visits: VisitOption[];
}) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [category, setCategory] = useState("opd_record");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [selectedVn, setSelectedVn] = useState(visits[0]?.vn || "");
    const [dragOver, setDragOver] = useState(false);
    const [filterVn, setFilterVn] = useState<string>("all");

    async function load() {
        setLoading(true);
        const res = await listPatientAttachments(hn);
        if (res.success) setItems(res.data as Attachment[]);
        setLoading(false);
    }

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [hn]);

    async function handleFile(file: File) {
        if (!selectedVn) {
            setError("กรุณาเลือก visit ที่จะแนบไฟล์");
            return;
        }
        setError("");
        setUploading(true);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("vn", selectedVn);
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

    async function handleDelete(att: Attachment) {
        if (!confirm(`ลบไฟล์ "${att.file_name}"?`)) return;
        const res = await deleteVisitAttachment(att.id, att.vn, hn);
        if (!res.success) { alert(res.error || "ลบไม่สำเร็จ"); return; }
        await load();
        router.refresh();
    }

    const filteredItems = filterVn === "all" ? items : items.filter(i => i.vn === filterVn);
    const vnOptions = visits.map(v => ({
        value: v.vn,
        label: `${new Date(v.visit_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })} · ${v.vn}`,
    }));

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="gonix-card-premium p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center">
                            <Paperclip className="h-5 w-5 text-blue-700" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">ไฟล์แนบทั้งหมด</h2>
                            <p className="text-xs text-slate-500">{items.length} ไฟล์ · {visits.length} visit</p>
                        </div>
                    </div>
                    {!showForm && (
                        <Button onClick={() => setShowForm(true)} className="rounded-xl gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white">
                            <Upload className="h-4 w-4" /> อัปโหลดไฟล์
                        </Button>
                    )}
                </div>

                {/* Filter by visit */}
                {visits.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">กรอง:</span>
                        <FilterChip active={filterVn === "all"} onClick={() => setFilterVn("all")}>
                            ทั้งหมด ({items.length})
                        </FilterChip>
                        {visits.slice(0, 5).map(v => {
                            const count = items.filter(i => i.vn === v.vn).length;
                            if (count === 0) return null;
                            return (
                                <FilterChip key={v.vn} active={filterVn === v.vn} onClick={() => setFilterVn(v.vn)}>
                                    {new Date(v.visit_date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ({count})
                                </FilterChip>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Upload form */}
            {showForm && (
                <div className="gonix-card-premium p-4 space-y-3 bg-blue-50/20">
                    {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Visit ที่แนบ</label>
                            <div className="relative">
                                <select
                                    value={selectedVn}
                                    onChange={e => setSelectedVn(e.target.value)}
                                    className="flex h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                    {vnOptions.length === 0 ? (
                                        <option value="">— ไม่มี visit —</option>
                                    ) : (
                                        vnOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                                    )}
                                </select>
                                <ChevronDown className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">หมวดหมู่</label>
                            <div className="relative">
                                <select value={category} onChange={e => setCategory(e.target.value)}
                                    className="flex h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                                        <option key={v} value={v}>{l}</option>
                                    ))}
                                </select>
                                <ChevronDown className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">หมายเหตุ</label>
                            <input
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder="เช่น ผล CBC, EKG..."
                                className="flex h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
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
                                <p className="text-sm text-slate-600">ลาก/วาง หรือคลิกเพื่อเลือกไฟล์</p>
                                <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG, WebP — ไม่เกิน 10MB</p>
                            </>
                        )}
                    </div>

                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleFile(file);
                            e.target.value = "";
                        }}
                    />

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { setShowForm(false); setError(""); }} className="rounded-lg">
                            ยกเลิก
                        </Button>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="p-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <Paperclip className="h-7 w-7 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-700">ยังไม่มีไฟล์แนบ</h3>
                    <p className="text-sm text-slate-500 mt-1">กดปุ่ม &ldquo;อัปโหลดไฟล์&rdquo; เพื่อเพิ่ม</p>
                </div>
            ) : (
                <div className="gonix-card-premium overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50/60">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="text-left px-4 py-2.5">ไฟล์</th>
                                <th className="text-left px-4 py-2.5">หมวด</th>
                                <th className="text-left px-4 py-2.5">Visit</th>
                                <th className="text-left px-4 py-2.5">อัปโหลด</th>
                                <th className="text-right px-4 py-2.5">ขนาด</th>
                                <th className="w-24"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map(att => {
                                const isImage = att.mime_type?.startsWith("image/");
                                const Icon = isImage ? ImageIcon : FileText;
                                return (
                                    <tr key={att.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="font-bold text-slate-800 truncate">{att.file_name}</div>
                                                    {att.note && <div className="text-[11px] text-slate-500 truncate">{att.note}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${CATEGORY_COLOR[att.category] || CATEGORY_COLOR.other}`}>
                                                {CATEGORY_LABELS[att.category] || att.category}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Link
                                                href={`/dashboard/visits/${att.vn}`}
                                                className="text-[11px] text-cyan-600 hover:text-cyan-700 font-mono inline-flex items-center gap-1"
                                            >
                                                {att.vn}
                                                <ExternalLink className="h-2.5 w-2.5" />
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5 text-[11px] text-slate-600">
                                            {new Date(att.uploaded_at).toLocaleDateString("th-TH")}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono text-[11px] text-slate-600 tabular-nums">
                                            {formatSize(att.file_size)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <div className="inline-flex items-center gap-0.5">
                                                <button
                                                    onClick={() => handleView(att.file_path)}
                                                    className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center"
                                                    title="เปิดดู"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(att)}
                                                    className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-50 inline-flex items-center justify-center"
                                                    title="ลบ"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-2.5 h-7 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${
                active ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
        >
            {children}
        </button>
    );
}
