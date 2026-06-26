"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Plus, X, AlertTriangle, Info, Bell } from "lucide-react";
import { createAnnouncement, dismissAnnouncement, type Announcement } from "@/lib/actions/announcements";

const LEVEL_CFG = {
    info: { bg: "bg-blue-50/70 border-blue-200/70", ic: "text-blue-600", Icon: Info, label: "ทั่วไป" },
    warning: { bg: "bg-amber-50/70 border-amber-200/70", ic: "text-amber-600", Icon: Bell, label: "แจ้งเตือน" },
    urgent: { bg: "bg-red-50/70 border-red-200/70", ic: "text-red-600", Icon: AlertTriangle, label: "ด่วน" },
} as const;

export function AnnouncementBoard({
    announcements,
    canManage,
}: {
    announcements: Announcement[];
    canManage: boolean;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [msg, setMsg] = useState("");
    const [level, setLevel] = useState<"info" | "warning" | "urgent">("info");
    const [expires, setExpires] = useState("");
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    const isEmpty = announcements.length === 0;

    // ไม่มีประกาศ + ไม่มีสิทธิ์โพสต์ → ซ่อนทั้งหมด
    if (isEmpty && !canManage) return null;

    // ไม่มีประกาศ + เป็นผู้จัดการ + ยังไม่เปิดฟอร์ม → เหลือแค่ปุ่มเล็ก ไม่รก dashboard
    if (isEmpty && !open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/70 border border-slate-200/70 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-[#2B54F0] transition-colors backdrop-blur"
            >
                <Megaphone className="h-3.5 w-3.5" /> เพิ่มประกาศ
            </button>
        );
    }

    function submit() {
        setErr(null);
        start(async () => {
            const res = await createAnnouncement({ message: msg, level, expires_at: expires || null });
            if (res.ok) {
                setMsg("");
                setLevel("info");
                setExpires("");
                setOpen(false);
                router.refresh();
            } else {
                setErr(res.error || "เกิดข้อผิดพลาด");
            }
        });
    }

    function remove(id: string) {
        start(async () => {
            await dismissAnnouncement(id);
            router.refresh();
        });
    }

    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-[#2B54F0]" />
                    <h2 className="text-base font-bold text-slate-800">ประกาศจากผู้จัดการ</h2>
                    {announcements.length > 0 && <span className="text-xs text-slate-400">({announcements.length})</span>}
                </div>
                {canManage && (
                    <button
                        onClick={() => setOpen((o) => !o)}
                        className="text-xs font-semibold text-[#2B54F0] hover:text-[#0026A1] inline-flex items-center gap-1"
                    >
                        {open ? <><X className="h-3.5 w-3.5" /> ยกเลิก</> : <><Plus className="h-3.5 w-3.5" /> เพิ่มประกาศ</>}
                    </button>
                )}
            </div>

            {/* ฟอร์มเพิ่ม */}
            {open && canManage && (
                <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white/60 p-4 space-y-3">
                    <textarea
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                        placeholder="พิมพ์ข้อความแจ้งพนักงาน เช่น เครื่องเลเซอร์ปิดซ่อม 9-12 น. / โปรโมชันเดือนนี้..."
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex gap-1.5">
                            {(["info", "warning", "urgent"] as const).map((k) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => setLevel(k)}
                                    className={`h-8 px-3 rounded-lg text-xs font-bold transition-all ${
                                        level === k ? "bg-[#2B54F0] text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                                    }`}
                                >
                                    {LEVEL_CFG[k].label}
                                </button>
                            ))}
                        </div>
                        <label className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                            ซ่อนหลังวันที่
                            <input
                                type="date"
                                value={expires}
                                onChange={(e) => setExpires(e.target.value)}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            />
                        </label>
                        <button
                            onClick={submit}
                            disabled={pending || !msg.trim()}
                            className="ml-auto h-9 px-4 rounded-xl bg-[#2B54F0] text-white text-sm font-bold disabled:opacity-50 hover:bg-[#0026A1] transition-colors"
                        >
                            {pending ? "กำลังโพสต์..." : "โพสต์ประกาศ"}
                        </button>
                    </div>
                    {err && <p className="text-xs text-red-600">{err}</p>}
                </div>
            )}

            {/* รายการประกาศ */}
            {announcements.length === 0 ? (
                !open && <p className="text-sm text-slate-400 py-1">ยังไม่มีประกาศ</p>
            ) : (
                <div className="space-y-2.5">
                    {announcements.map((a) => {
                        const c = LEVEL_CFG[a.level] || LEVEL_CFG.info;
                        const Icon = c.Icon;
                        return (
                            <div key={a.id} className={`rounded-xl border p-3 flex items-start gap-3 ${c.bg}`}>
                                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${c.ic}`} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap break-words">{a.message}</p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        {a.created_by_name || "ผู้จัดการ"}
                                        {a.expires_at ? ` · ถึง ${a.expires_at}` : ""}
                                    </p>
                                </div>
                                {canManage && (
                                    <button
                                        onClick={() => remove(a.id)}
                                        disabled={pending}
                                        title="ปลดประกาศ"
                                        className="shrink-0 h-7 w-7 rounded-lg hover:bg-white/70 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
