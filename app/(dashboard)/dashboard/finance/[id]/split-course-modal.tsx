"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Sparkles } from "lucide-react";
import { splitInjectableToCourse } from "@/lib/actions/invoices";
import { toast } from "@/lib/toast";

// แยกส่วนที่ยังไม่ได้ฉีดเป็นคอร์ส — กรณีขายไปแล้วแต่ไม่ได้บันทึกเป็นคอร์ส (เช่น จ่าย 100u ฉีด 50u)
export default function SplitCourseModal({ invId, item, services, onClose }: {
    invId: string;
    item: { id: string; item_name: string; qty: number; item_type: string };
    services: { id: string; name: string }[];
    onClose: () => void;
}) {
    const router = useRouter();
    const [unused, setUnused] = useState(String(Math.floor(Number(item.qty) / 2) || ""));
    const [sessions, setSessions] = useState("1");
    const [serviceId, setServiceId] = useState("");
    const [q, setQ] = useState("");
    const [restore, setRestore] = useState(item.item_type === "injectable");
    const [note, setNote] = useState("");
    const [pending, start] = useTransition();
    const list = q ? services.filter(s => s.name.toLowerCase().includes(q.toLowerCase())) : services;
    const used = Number(item.qty) - (Number(unused) || 0);

    function save() {
        start(async () => {
            const r = await splitInjectableToCourse({ invId, itemId: item.id, unusedQty: Number(unused), sessions: Number(sessions), serviceId, restoreStock: restore, note });
            if (!r.success) { toast.error(r.error || "ไม่สำเร็จ"); return; }
            toast.success(`สร้างคอร์สแล้ว${r.restored ? ` · คืนสต๊อก ${r.restored}` : ""}`);
            onClose(); router.refresh();
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3">
                <div className="flex items-center">
                    <h2 className="text-base font-bold text-slate-800 flex-1 inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-violet-600" /> แยกส่วนที่ยังไม่ได้ใช้เป็นคอร์ส</h2>
                    <button onClick={onClose} aria-label="ปิด"><X className="h-4 w-4 text-slate-400" /></button>
                </div>
                <p className="text-sm text-slate-600">{item.item_name} · ในบิล {Number(item.qty).toLocaleString()} หน่วย</p>

                <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-slate-600 space-y-1"><span className="font-semibold">ยังไม่ได้ใช้ (เก็บไว้ใช้ครั้งหน้า)</span>
                        <input type="number" min={1} max={Number(item.qty) - 1} value={unused} onChange={e => setUnused(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-right tabular-nums" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1"><span className="font-semibold">แบ่งใช้กี่ครั้ง</span>
                        <input type="number" min={1} value={sessions} onChange={e => setSessions(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-right tabular-nums" />
                    </label>
                </div>
                <div className="text-xs text-slate-500">ใช้ไปแล้ววันนี้ <b className="text-slate-700">{used > 0 ? used.toLocaleString() : "—"}</b> · คงเหลือ <b className="text-violet-700">{Number(unused) || 0}</b></div>

                <label className="block text-xs text-slate-600 space-y-1"><span className="font-semibold">เมนูบริการที่ใช้ตอนกลับมาฉีด *</span>
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นเมนู เช่น Botox 50u" className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
                    <select value={serviceId} onChange={e => setServiceId(e.target.value)} size={Math.min(6, Math.max(3, list.length))} className="w-full rounded-lg border border-slate-300 px-2 text-sm">
                        {list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <span className="text-[11px] text-slate-400">ตอนตัดคอส ระบบตัดสต๊อกตามสูตรของเมนูนี้ + คิดค่ามือตามเมนู</span>
                </label>

                <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={restore} onChange={e => setRestore(e.target.checked)} className="h-4 w-4 mt-0.5" disabled={item.item_type !== "injectable"} />
                    <span>คืนสต๊อกส่วนที่ยังไม่ได้ฉีดกลับเข้าขวด <span className="text-xs text-slate-500">(บิลตัดไปเต็มจำนวน — ครั้งหน้าจะตัดใหม่ตอนฉีดจริง)</span></span>
                </label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (เช่น นัดฉีดอีก 6 เดือน)" className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />

                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                    รายได้ของบิลนี้รับรู้ไปแล้ว → คอร์สนี้มูลค่า ฿0 (ตอนมาใช้ไม่นับรายได้ซ้ำ) · ต้นทุนยาของบิลลดตามส่วนที่คืน · มีบันทึกประวัติการแก้ไข
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="h-9 px-4 rounded-lg text-sm text-slate-600">ยกเลิก</button>
                    <button onClick={save} disabled={pending || !serviceId || !(Number(unused) > 0) || Number(unused) >= Number(item.qty)}
                        className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                        {pending && <Loader2 className="h-4 w-4 animate-spin" />} สร้างคอร์ส
                    </button>
                </div>
            </div>
        </div>
    );
}
