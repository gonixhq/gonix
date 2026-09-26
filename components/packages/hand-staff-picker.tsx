"use client";

import { useEffect, useState } from "react";
import { listHandStaff } from "@/lib/actions/packages";

export type HandStaff = { id: string; name: string };
export type HandPick = { main: string; asst: string };

// ผู้ปฏิบัติหลัก/ผู้ช่วย ตอนตัดคอส → ค่ามือต่อครั้ง (เฟส 2C) · ไม่บังคับ
export default function HandStaffPicker({ value, onChange, staff }: {
    value: HandPick;
    onChange: (v: HandPick) => void;
    staff?: HandStaff[];   // ส่งมาเองได้ ไม่งั้นโหลดเอง
}) {
    const [list, setList] = useState<HandStaff[]>(staff || []);
    useEffect(() => {
        if (staff) return;
        listHandStaff().then(setList).catch(() => setList([]));
    }, [staff]);
    const opts = staff || list;
    const cls = (on: boolean) => `h-9 w-full rounded-xl border bg-white px-2 text-sm ${on ? "border-emerald-300 text-emerald-800" : "border-slate-200 text-slate-500"}`;
    return (
        <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600 space-y-1">
                <span className="font-semibold">ผู้ปฏิบัติหลัก (ค่ามือ)</span>
                <select value={value.main} onChange={e => onChange({ main: e.target.value, asst: value.asst === e.target.value ? "" : value.asst })} className={cls(!!value.main)}>
                    <option value="">— ไม่ระบุ —</option>
                    {opts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </label>
            <label className="text-xs text-slate-600 space-y-1">
                <span className="font-semibold">ผู้ช่วย</span>
                <select value={value.asst} onChange={e => onChange({ ...value, asst: e.target.value })} className={cls(!!value.asst)}>
                    <option value="">— ไม่มี —</option>
                    {opts.filter(s => s.id !== value.main).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </label>
        </div>
    );
}
