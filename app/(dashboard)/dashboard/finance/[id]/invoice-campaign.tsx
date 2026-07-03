"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, Loader2 } from "lucide-react";
import { setInvoiceCampaign } from "@/lib/actions/marketing-report";

/** ช่องแท็กแคมเปญ/โปรฯ ให้บิล (self-contained — ไม่แตะ flow void/refund) */
export default function InvoiceCampaign({ invId, initial }: { invId: string; initial: string | null }) {
    const router = useRouter();
    const [val, setVal] = useState(initial || "");
    const [pending, start] = useTransition();
    const [saved, setSaved] = useState(false);
    const dirty = (val.trim() || "") !== (initial || "");

    function save() {
        start(async () => {
            const r = await setInvoiceCampaign(invId, val);
            if (!r.success) { alert(r.error || "บันทึกไม่สำเร็จ"); return; }
            setSaved(true); setTimeout(() => setSaved(false), 1500);
            router.refresh();
        });
    }

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-pink-600 shrink-0" />
            <span className="text-xs font-bold text-slate-600 shrink-0">แคมเปญ/โปรฯ</span>
            <input value={val} onChange={e => setVal(e.target.value)} placeholder="เช่น สงกรานต์65, LINE10%"
                className="flex-1 h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" />
            <button onClick={save} disabled={pending || !dirty}
                className="h-9 px-3 rounded-lg bg-[#2B54F0] text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : "บันทึก"}
            </button>
        </div>
    );
}
