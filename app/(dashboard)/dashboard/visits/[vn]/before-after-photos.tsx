"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Trash2, Plus, Loader2, ImageIcon, ArrowLeftRight } from "lucide-react";
import { uploadAestheticPhoto, deleteAestheticPhoto } from "@/lib/actions/aesthetic";
import type { AestheticPhoto } from "@/lib/aesthetic-types";

interface Props {
    vn: string;
    before: AestheticPhoto[];
    after: AestheticPhoto[];
}

export default function BeforeAfterPhotos({ vn, before, after }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [lightbox, setLightbox] = useState<AestheticPhoto | null>(null);
    const [compare, setCompare] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const beforeInputRef = useRef<HTMLInputElement>(null);
    const afterInputRef = useRef<HTMLInputElement>(null);

    function handleUpload(type: "before" | "after", file: File | null) {
        if (!file) return;
        setError(null);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("vn", vn);
        formData.append("type", type);
        startTransition(async () => {
            const result = await uploadAestheticPhoto(formData);
            if (!result.success) {
                setError(result.error || "อัปโหลดไม่สำเร็จ");
                return;
            }
            router.refresh();
        });
    }

    function handleDelete(type: "before" | "after", path: string) {
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

    const canCompare = before.length > 0 && after.length > 0;

    return (
        <div className="space-y-4">
            {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}

            {/* Toggle compare mode */}
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-800">รูปก่อน / หลัง</h3>
                {canCompare && (
                    <Button
                        variant={compare ? "default" : "outline"}
                        onClick={() => setCompare(!compare)}
                        size="sm"
                        className={`rounded-lg gap-1.5 ${compare ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
                    >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        {compare ? "ออกจากโหมดเปรียบเทียบ" : "เปรียบเทียบ Before/After"}
                    </Button>
                )}
            </div>

            {compare && canCompare ? (
                <CompareSlider before={before[0]} after={after[0]} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* BEFORE */}
                    <PhotoColumn
                        title="ก่อนทำหัตถการ (Before)"
                        color="amber"
                        photos={before}
                        isPending={isPending}
                        onUploadClick={() => beforeInputRef.current?.click()}
                        onView={setLightbox}
                        onDelete={(path) => handleDelete("before", path)}
                    />
                    <input
                        ref={beforeInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => handleUpload("before", e.target.files?.[0] || null)}
                    />

                    {/* AFTER */}
                    <PhotoColumn
                        title="หลังทำหัตถการ (After)"
                        color="emerald"
                        photos={after}
                        isPending={isPending}
                        onUploadClick={() => afterInputRef.current?.click()}
                        onView={setLightbox}
                        onDelete={(path) => handleDelete("after", path)}
                    />
                    <input
                        ref={afterInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => handleUpload("after", e.target.files?.[0] || null)}
                    />
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
        </div>
    );
}

function PhotoColumn({
    title, color, photos, isPending, onUploadClick, onView, onDelete,
}: {
    title: string;
    color: "amber" | "emerald";
    photos: AestheticPhoto[];
    isPending: boolean;
    onUploadClick: () => void;
    onView: (p: AestheticPhoto) => void;
    onDelete: (path: string) => void;
}) {
    const styles = color === "amber"
        ? { border: "border-amber-300", bg: "bg-amber-50/50", titleBg: "bg-amber-100", titleText: "text-amber-800", btn: "border-amber-400 text-amber-700 hover:bg-amber-100" }
        : { border: "border-emerald-300", bg: "bg-emerald-50/50", titleBg: "bg-emerald-100", titleText: "text-emerald-800", btn: "border-emerald-400 text-emerald-700 hover:bg-emerald-100" };

    return (
        <div className={`rounded-2xl border-2 ${styles.border} ${styles.bg} overflow-hidden`}>
            <div className={`px-4 py-2.5 ${styles.titleBg} ${styles.titleText} font-bold text-sm flex items-center justify-between`}>
                <span>{title}</span>
                <span className="text-xs opacity-70">{photos.length} รูป</span>
            </div>
            <div className="p-3 space-y-2">
                {photos.length === 0 ? (
                    <div className="aspect-[4/3] rounded-xl bg-white/60 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 text-sm">
                        <ImageIcon className="h-10 w-10 mb-1.5 opacity-50" />
                        <span>ยังไม่มีรูป</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {photos.map(p => (
                            <div key={p.path} className="relative aspect-square rounded-xl overflow-hidden bg-white group shadow-sm">
                                <img
                                    src={p.url}
                                    alt={p.label || ""}
                                    className="w-full h-full object-cover cursor-pointer"
                                    onClick={() => onView(p)}
                                />
                                <button
                                    type="button"
                                    onClick={() => onDelete(p.path)}
                                    disabled={isPending}
                                    className="absolute top-1.5 right-1.5 h-7 w-7 rounded-lg bg-black/60 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-rose-600"
                                    title="ลบรูป"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                {p.label && (
                                    <div className="absolute bottom-0 left-0 right-0 px-2 py-0.5 bg-black/60 text-white text-[11px] truncate">
                                        {p.label}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <Button
                    onClick={onUploadClick}
                    disabled={isPending}
                    variant="outline"
                    className={`w-full rounded-lg gap-1.5 ${styles.btn} bg-white/60 h-10`}
                >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    ถ่ายรูป / เลือกรูป
                </Button>
            </div>
        </div>
    );
}

function CompareSlider({ before, after }: { before: AestheticPhoto; after: AestheticPhoto }) {
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
        <div className="space-y-2">
            <div
                ref={containerRef}
                className="relative rounded-2xl overflow-hidden border-2 border-slate-300 select-none touch-none mx-auto"
                style={{ maxWidth: "800px" }}
                onPointerMove={(e) => { if (e.buttons === 1) handleMove(e); }}
                onPointerDown={handleMove}
            >
                {/* After (background) */}
                <img src={after.url} alt="After" className="block w-full h-auto" draggable={false} />
                {/* Before (clipped overlay) */}
                <div
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                >
                    <img src={before.url} alt="Before" className="block w-full h-auto" draggable={false} />
                </div>

                {/* Slider line */}
                <div
                    className="absolute top-0 bottom-0 w-1 bg-white shadow-lg pointer-events-none"
                    style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white shadow-lg flex items-center justify-center border-2 border-blue-500">
                        <ArrowLeftRight className="h-4 w-4 text-blue-600" />
                    </div>
                </div>

                {/* Labels */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-amber-500 text-white text-xs font-bold shadow-md">BEFORE</div>
                <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-emerald-500 text-white text-xs font-bold shadow-md">AFTER</div>
            </div>
            <p className="text-xs text-center text-slate-500">
                💡 ลาก slider ตรงกลางเพื่อเปรียบเทียบ — แสดง Before (ซ้าย) vs After (ขวา)
            </p>
        </div>
    );
}
