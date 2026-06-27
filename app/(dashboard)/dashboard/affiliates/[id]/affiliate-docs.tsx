"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Trash2, Loader2, Eye, IdCard, Landmark } from "lucide-react";
import { uploadAffiliateDoc, getAffiliateDocUrl, deleteAffiliateDoc } from "@/lib/actions/affiliates";

type DocKind = "id_card" | "bank_book";
const META: Record<DocKind, { label: string; icon: typeof IdCard }> = {
    id_card: { label: "สำเนาบัตรประชาชน", icon: IdCard },
    bank_book: { label: "หน้าบัญชีธนาคาร", icon: Landmark },
};

export default function AffiliateDocs({ affiliateId, idCardPath, bankBookPath }: { affiliateId: string; idCardPath: string | null; bankBookPath: string | null }) {
    return (
        <div className="gonix-card-premium p-5">
            <div className="font-bold text-slate-800 text-sm mb-3">เอกสารแนบ (สำหรับโอนเงิน / หัก ณ ที่จ่าย)</div>
            <div className="grid sm:grid-cols-2 gap-3">
                <DocSlot affiliateId={affiliateId} kind="id_card" path={idCardPath} />
                <DocSlot affiliateId={affiliateId} kind="bank_book" path={bankBookPath} />
            </div>
            <p className="text-[11px] text-slate-400 mt-3">รองรับ PDF / รูปภาพ ไม่เกิน 10MB · ลิงก์เปิดดูมีอายุ 60 วินาที</p>
        </div>
    );
}

function DocSlot({ affiliateId, kind, path }: { affiliateId: string; kind: DocKind; path: string | null }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const { label, icon: Icon } = META[kind];

    function onPick(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("affiliate_id", affiliateId);
        fd.append("kind", kind);
        setBusy(true);
        start(async () => {
            const r = await uploadAffiliateDoc(fd);
            setBusy(false);
            if (fileRef.current) fileRef.current.value = "";
            if (!r.success) alert(r.error || "อัปโหลดไม่สำเร็จ");
            router.refresh();
        });
    }
    async function view() {
        if (!path) return;
        const url = await getAffiliateDocUrl(path);
        if (url) window.open(url, "_blank", "noopener");
        else alert("เปิดเอกสารไม่สำเร็จ");
    }
    function remove() {
        if (!confirm(`ลบ${label}?`)) return;
        start(async () => { await deleteAffiliateDoc(affiliateId, kind); router.refresh(); });
    }

    return (
        <div className={`rounded-xl border p-3 ${path ? "border-emerald-200 bg-emerald-50/40" : "border-dashed border-slate-300 bg-slate-50/40"}`}>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><Icon className="h-4 w-4 text-slate-500" /> {label}</div>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onPick} />
            {path ? (
                <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><FileText className="h-3.5 w-3.5" /> อัปโหลดแล้ว</span>
                    <button onClick={view} className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-[#2B54F0] hover:underline"><Eye className="h-3.5 w-3.5" /> เปิดดู</button>
                    <button onClick={() => fileRef.current?.click()} disabled={pending} className="text-[11px] text-slate-500 hover:text-slate-800">เปลี่ยน</button>
                    <button onClick={remove} disabled={pending} className="text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
            ) : (
                <button onClick={() => fileRef.current?.click()} disabled={busy || pending}
                    className="mt-2 w-full h-9 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-600 inline-flex items-center justify-center gap-1.5 hover:border-[#2B54F0] disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} อัปโหลด
                </button>
            )}
        </div>
    );
}
