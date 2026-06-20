"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Camera, Trash2, Image as ImageIcon, ArrowLeftRight, Calendar,
    Loader2, Sparkles, ExternalLink, X,
} from "lucide-react";
import { uploadAestheticPhoto, deleteAestheticPhoto } from "@/lib/actions/aesthetic";
import type { AestheticPhoto } from "@/lib/aesthetic-types";

interface VisitWithPhotos {
    vn: string;
    visit_date: string;
    before: AestheticPhoto[];
    after: AestheticPhoto[];
}

interface Props {
    hn: string;
    visits: VisitWithPhotos[];
}

export default function PatientPhotosTab({ hn, visits }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [lightbox, setLightbox] = useState<AestheticPhoto | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [compare, setCompare] = useState<{ before: AestheticPhoto; after: AestheticPhoto } | null>(null);

    const beforeInputRef = useRef<HTMLInputElement>(null);
    const afterInputRef = useRef<HTMLInputElement>(null);
    const [uploadingVn, setUploadingVn] = useState<string | null>(null);

    function triggerUpload(vn: string, type: "before" | "after") {
        setUploadingVn(vn);
        // Set data attribute so we know which visit when input changes
        if (type === "before") beforeInputRef.current?.setAttribute("data-vn", vn);
        else afterInputRef.current?.setAttribute("data-vn", vn);
        if (type === "before") beforeInputRef.current?.click();
        else afterInputRef.current?.click();
    }

    function handleUpload(type: "before" | "after", file: File | null) {
        const ref = type === "before" ? beforeInputRef.current : afterInputRef.current;
        const vn = ref?.getAttribute("data-vn");
        if (!file || !vn) return;
        setError(null);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("vn", vn);
        formData.append("type", type);
        startTransition(async () => {
            const result = await uploadAestheticPhoto(formData);
            setUploadingVn(null);
            if (!result.success) {
                setError(result.error || "อัปโหลดไม่สำเร็จ");
                return;
            }
            router.refresh();
        });
        // Reset
        if (ref) ref.value = "";
    }

    function handleDelete(vn: string, type: "before" | "after", path: string) {
        if (!confirm("ลบรูปนี้?")) return;
        startTransition(async () => {
            const result = await deleteAestheticPhoto(vn, type, path);
            if (!result.success) {
                setError(result.error || "ลบไม่สำเร็จ");
                return;
            }
            router.refresh();
        });
    }

    const totalBefore = visits.reduce((s, v) => s + v.before.length, 0);
    const totalAfter = visits.reduce((s, v) => s + v.after.length, 0);
    const totalVisits = visits.filter(v => v.before.length > 0 || v.after.length > 0).length;

    return (
        <div className="space-y-4">
            {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <StatCard label="ครั้งที่มีรูป" value={totalVisits} icon={Calendar} color="slate" />
                <StatCard label="รูปก่อน" value={totalBefore} icon={ImageIcon} color="amber" />
                <StatCard label="รูปหลัง" value={totalAfter} icon={ImageIcon} color="emerald" />
            </div>

            {/* Hidden file inputs */}
            <input
                ref={beforeInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handleUpload("before", e.target.files?.[0] || null)}
            />
            <input
                ref={afterInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handleUpload("after", e.target.files?.[0] || null)}
            />

            {visits.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="h-7 w-7 text-rose-500" />
                    </div>
                    <h3 className="font-bold text-slate-700">ยังไม่มี visit ความงาม</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        ต้องสร้าง visit ประเภท &ldquo;ความงาม / หัตถการ&rdquo; ก่อน
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {visits.map(v => (
                        <VisitPhotoCard
                            key={v.vn}
                            visit={v}
                            isPending={isPending && uploadingVn === v.vn}
                            onUploadBefore={() => triggerUpload(v.vn, "before")}
                            onUploadAfter={() => triggerUpload(v.vn, "after")}
                            onView={setLightbox}
                            onDelete={(type, path) => handleDelete(v.vn, type, path)}
                            onCompare={(b, a) => setCompare({ before: b, after: a })}
                        />
                    ))}
                </div>
            )}

            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
                    onClick={() => setLightbox(null)}
                >
                    <img src={lightbox.url} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" />
                </div>
            )}

            {/* Compare modal */}
            {compare && <CompareModal before={compare.before} after={compare.after} onClose={() => setCompare(null)} />}
        </div>
    );
}

function StatCard({ label, value, icon: Icon, color }: {
    label: string;
    value: number;
    icon: React.ElementType;
    color: "slate" | "amber" | "emerald";
}) {
    const styles = {
        slate: "bg-slate-50 border-slate-200 text-slate-800",
        amber: "bg-amber-50 border-amber-200 text-amber-800",
        emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    }[color];
    const iconStyle = {
        slate: "text-slate-500",
        amber: "text-amber-600",
        emerald: "text-emerald-600",
    }[color];
    return (
        <div className={`rounded-2xl border-2 ${styles} p-3 flex items-center gap-3`}>
            <div className={`h-9 w-9 rounded-xl bg-white flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 ${iconStyle}`} />
            </div>
            <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
                <div className="text-xl font-bold tabular-nums">{value}</div>
            </div>
        </div>
    );
}

function VisitPhotoCard({
    visit, isPending, onUploadBefore, onUploadAfter, onView, onDelete, onCompare,
}: {
    visit: VisitWithPhotos;
    isPending: boolean;
    onUploadBefore: () => void;
    onUploadAfter: () => void;
    onView: (p: AestheticPhoto) => void;
    onDelete: (type: "before" | "after", path: string) => void;
    onCompare: (before: AestheticPhoto, after: AestheticPhoto) => void;
}) {
    const canCompare = visit.before.length > 0 && visit.after.length > 0;

    return (
        <div className="gonix-card-premium overflow-hidden">
            <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2 min-w-0">
                    <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
                    <div className="min-w-0">
                        <div className="font-bold text-slate-800">
                            {new Date(visit.visit_date).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                        <Link
                            href={`/dashboard/visits/${visit.vn}`}
                            className="text-[11px] text-cyan-600 hover:text-cyan-700 font-mono inline-flex items-center gap-1"
                        >
                            {visit.vn}
                            <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                    </div>
                </div>
                {canCompare && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onCompare(visit.before[0], visit.after[0])}
                        className="rounded-lg h-8 text-xs gap-1.5"
                    >
                        <ArrowLeftRight className="h-3 w-3" /> เปรียบเทียบ
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                <PhotoColumn
                    title="ก่อนทำ"
                    color="amber"
                    photos={visit.before}
                    isPending={isPending}
                    onUpload={onUploadBefore}
                    onView={onView}
                    onDelete={path => onDelete("before", path)}
                />
                <PhotoColumn
                    title="หลังทำ"
                    color="emerald"
                    photos={visit.after}
                    isPending={isPending}
                    onUpload={onUploadAfter}
                    onView={onView}
                    onDelete={path => onDelete("after", path)}
                />
            </div>
        </div>
    );
}

function PhotoColumn({
    title, color, photos, isPending, onUpload, onView, onDelete,
}: {
    title: string;
    color: "amber" | "emerald";
    photos: AestheticPhoto[];
    isPending: boolean;
    onUpload: () => void;
    onView: (p: AestheticPhoto) => void;
    onDelete: (path: string) => void;
}) {
    const styles = color === "amber"
        ? { border: "border-amber-200", titleBg: "bg-amber-100 text-amber-800", btn: "border-amber-400 text-amber-700 hover:bg-amber-50" }
        : { border: "border-emerald-200", titleBg: "bg-emerald-100 text-emerald-800", btn: "border-emerald-400 text-emerald-700 hover:bg-emerald-50" };

    return (
        <div className={`rounded-xl border-2 ${styles.border} overflow-hidden`}>
            <div className={`px-3 py-2 ${styles.titleBg} font-bold text-xs flex items-center justify-between`}>
                <span>{title}</span>
                <span className="opacity-70">{photos.length} รูป</span>
            </div>
            <div className="p-2.5 space-y-2 bg-white">
                {photos.length === 0 ? (
                    <div className="aspect-[4/3] rounded-lg bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 text-xs">
                        <ImageIcon className="h-8 w-8 mb-1 opacity-50" />
                        <span>ยังไม่มีรูป</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                        {photos.map(p => (
                            <div key={p.path} className="relative aspect-square rounded-lg overflow-hidden bg-white group">
                                <img
                                    src={p.url}
                                    alt=""
                                    className="w-full h-full object-cover cursor-pointer"
                                    onClick={() => onView(p)}
                                />
                                <button
                                    type="button"
                                    onClick={() => onDelete(p.path)}
                                    disabled={isPending}
                                    className="absolute top-1 right-1 h-6 w-6 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-rose-600"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <Button
                    onClick={onUpload}
                    disabled={isPending}
                    variant="outline"
                    size="sm"
                    className={`w-full rounded-lg gap-1.5 ${styles.btn} h-8 text-xs`}
                >
                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                    ถ่ายรูป / เลือกรูป
                </Button>
            </div>
        </div>
    );
}

function CompareModal({ before, after, onClose }: { before: AestheticPhoto; after: AestheticPhoto; onClose: () => void }) {
    const [pos, setPos] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);

    function handleMove(e: React.PointerEvent<HTMLDivElement>) {
        if (e.buttons !== 1 && e.type !== "pointermove") return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setPos(pct);
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <ArrowLeftRight className="h-5 w-5 text-blue-600" />
                        เปรียบเทียบ Before / After
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>
                <div
                    ref={containerRef}
                    className="relative select-none touch-none"
                    onPointerMove={e => { if (e.buttons === 1) handleMove(e); }}
                    onPointerDown={handleMove}
                >
                    <img src={after.url} alt="After" className="block w-full h-auto" draggable={false} />
                    <div
                        className="absolute inset-0 overflow-hidden pointer-events-none"
                        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                    >
                        <img src={before.url} alt="Before" className="block w-full h-auto" draggable={false} />
                    </div>
                    <div
                        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg pointer-events-none"
                        style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white shadow-lg flex items-center justify-center border-2 border-blue-500">
                            <ArrowLeftRight className="h-4 w-4 text-blue-600" />
                        </div>
                    </div>
                    <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-amber-500 text-white text-xs font-bold shadow-md">BEFORE</div>
                    <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-emerald-500 text-white text-xs font-bold shadow-md">AFTER</div>
                </div>
                <p className="text-xs text-center text-slate-500 p-3 bg-slate-50">
                    ลาก slider ตรงกลางเพื่อเปรียบเทียบ
                </p>
            </div>
        </div>
    );
}
