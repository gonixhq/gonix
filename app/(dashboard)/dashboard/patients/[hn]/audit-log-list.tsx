"use client";

import { useMemo, useState } from "react";
import { Pencil, User, Clock, Search } from "lucide-react";

interface AuditLog {
    id: string;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    changed_at: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    changer?: any;
}

const changerName = (log: AuditLog) => {
    const c = Array.isArray(log.changer) ? log.changer[0] : log.changer;
    return c?.full_name || "Unknown";
};

/** รายการ Log การแก้ไข + ช่องค้นหา (กรองตาม field / ค่า / ผู้แก้ไข) */
export default function AuditLogList({ logs }: { logs: AuditLog[] }) {
    const [q, setQ] = useState("");

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return logs;
        return logs.filter((l) =>
            [l.field_name, l.old_value, l.new_value, changerName(l)]
                .filter(Boolean)
                .some((s) => String(s).toLowerCase().includes(term)),
        );
    }, [logs, q]);

    return (
        <div>
            <div className="px-5 py-3 border-b border-slate-100">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="ค้นหา field / ค่า / ชื่อผู้แก้ไข..."
                        className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30"
                    />
                </div>
                {q && (
                    <p className="text-xs text-slate-400 mt-1.5">พบ {filtered.length} จาก {logs.length} รายการ</p>
                )}
            </div>
            {filtered.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">ไม่พบรายการที่ค้นหา</div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {filtered.map((log) => (
                        <div key={log.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/50 transition-colors">
                            <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                                <Pencil className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap text-sm">
                                    <span className="font-bold text-slate-800">{log.field_name}</span>
                                    <span className="text-xs text-slate-400">เปลี่ยนจาก</span>
                                    <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded font-mono max-w-[150px] truncate">{log.old_value || "—"}</span>
                                    <span className="text-xs text-slate-400">→</span>
                                    <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono max-w-[150px] truncate">{log.new_value || "—"}</span>
                                </div>
                                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                                    <User className="h-3 w-3" />
                                    {changerName(log)}
                                    <span>·</span>
                                    <Clock className="h-3 w-3" />
                                    {new Date(log.changed_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
