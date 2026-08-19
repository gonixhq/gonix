"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X, ZoomIn } from "lucide-react";
import { uploadLabReportImage, removeLabReportImage, signLabReportImages } from "@/lib/actions/lab-report-images";

// อัปโหลด/พรีวิว/ลบ รูปผลตรวจแนบในใบ Laboratory Report (ต่อ 1 Sample Type)
// โชว์เฉพาะใบพิมพ์ในคลินิก — เก็บใน lab_report_meta[sampleType].images[]
export default function LabImageUploader({ scope, caseKey, sampleType, paths }: {
    scope: "visit" | "anon"; caseKey: string; sampleType: string; paths: string[];
}) {
    const router = useRouter();
    const [busy, start] = useTransition();
    const [urls, setUrls] = useState<{ path: string; url: string }[]>([]);
    const [err, setErr] = useState("");
    const [zoom, setZoom] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const pj = (paths || []).join("|");

    useEffect(() => {
        let alive = true;
        if (!paths || paths.length === 0) { setUrls([]); return; }
        signLabReportImages(paths).then((signed) => {
            if (alive) setUrls(paths.map((p, i) => ({ path: p, url: signed[i] || "" })));
        });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pj]);

    const onPick = (file: File | null) => {
        if (fileRef.current) fileRef.current.value = "";
        if (!file) return;
        setErr("");
        const fd = new FormData();
        fd.append("file", file);
        start(async () => {
            const r = await uploadLabReportImage(scope, caseKey, sampleType, fd);
            if (!r.ok) { setErr(r.error || "อัปโหลดไม่สำเร็จ"); return; }
            router.refresh();
        });
    };

    const onRemove = (path: string) => start(async () => {
        await removeLabReportImage(scope, caseKey, sampleType, path);
        router.refresh();
    });

    return (
        <div className="rounded-xl border border-slate-200 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">รูปผลตรวจแนบ (Attached Result)</div>
                <label className={`h-8 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:bg-blue-100 ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} เพิ่มรูป
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => onPick(e.target.files?.[0] || null)} disabled={busy} />
                </label>
            </div>
            <p className="text-[10.5px] text-slate-400">แนบรูป/สแกนผลตรวจ เช่น สลิป urinalysis จากเครื่อง — จะพิมพ์ต่อท้ายตารางผลในใบรายงาน (รองรับ JPG / PNG / WebP ไม่เกิน 10MB)</p>
            {err && <p className="text-[11px] text-rose-600">{err}</p>}
            {(paths?.length || 0) > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {urls.map(({ path, url }) => (
                        <div key={path} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                            {url
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={url} alt="ผลตรวจ" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>}
                            {url && (
                                <button type="button" onClick={() => setZoom(url)}
                                    className="absolute inset-0 bg-black/0 hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                    <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                                </button>
                            )}
                            <button type="button" onClick={() => onRemove(path)} disabled={busy}
                                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-white disabled:opacity-50">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[11px] text-slate-400 italic">ยังไม่มีรูปแนบสำหรับใบนี้</p>
            )}
            {zoom && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => setZoom(null)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={zoom} alt="ผลตรวจ (ขยาย)" className="max-w-full max-h-full rounded-lg shadow-2xl" />
                </div>
            )}
        </div>
    );
}
