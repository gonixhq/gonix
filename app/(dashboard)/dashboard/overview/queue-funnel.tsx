import Link from "next/link";
import { Users2, DoorClosed, DoorOpen, Wrench } from "lucide-react";

export interface FunnelBucket {
    key: string;
    label: string;
    count: number;
    overdue: number; // จำนวนที่รอเกิน 15 นาที
    tile: string;
    text: string;
    href: string;
}

/** Queue Funnel — นับคิวตามสถานะ + เตือนแดงเมื่อมีคนรอเกินเกณฑ์ */
export function QueueFunnel({ buckets }: { buckets: FunnelBucket[] }) {
    const totalOverdue = buckets.reduce((s, b) => s + b.overdue, 0);
    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Users2 className="h-4 w-4 text-[#2B54F0]" />
                    <h2 className="text-base font-bold text-slate-800">สถานะคิววันนี้</h2>
                    {totalOverdue > 0 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700 ring-1 ring-red-300 animate-pulse">
                            ⚠ รอเกิน 15 นาที {totalOverdue} ราย
                        </span>
                    )}
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {buckets.map((b) => (
                    <Link
                        key={b.key}
                        href={b.href}
                        className={`relative rounded-2xl p-3.5 border transition-all hover:-translate-y-0.5 hover:shadow-md ${
                            b.overdue > 0 ? "border-red-300 ring-1 ring-red-200 bg-red-50/40" : "border-slate-200/70 bg-white/60"
                        }`}
                    >
                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center mb-2 ${b.tile}`}>
                            <span className={`text-sm font-black ${b.text}`}>{b.count}</span>
                        </div>
                        <div className="text-xs font-bold text-slate-700 leading-tight">{b.label}</div>
                        {b.overdue > 0 && (
                            <div className="mt-1 text-[10px] font-bold text-red-600">รอเกิน {b.overdue} ราย</div>
                        )}
                    </Link>
                ))}
            </div>
        </div>
    );
}

export interface RoomLight {
    room_id: string;
    room_name: string;
    state: "free" | "busy" | "off";
    detail?: string | null;
    serves?: string | null; // แผนกที่ห้องนี้รองรับ (แสดงตอนว่าง — ช่วยจ่ายคิว)
}

/** ไฟจราจรห้องตรวจ — เขียว=ว่าง / แดง=ใช้งาน / เทา=ปิด */
export function RoomStatusBoard({ rooms }: { rooms: RoomLight[] }) {
    const cfg = {
        free: { dot: "bg-emerald-500", ring: "ring-emerald-200", bg: "bg-emerald-50/50 border-emerald-200/70", label: "ว่าง", Icon: DoorOpen, ic: "text-emerald-600" },
        busy: { dot: "bg-red-500 animate-pulse", ring: "ring-red-200", bg: "bg-red-50/50 border-red-200/70", label: "ใช้งาน", Icon: DoorClosed, ic: "text-red-600" },
        off: { dot: "bg-slate-400", ring: "ring-slate-200", bg: "bg-slate-50/60 border-slate-200/70", label: "ปิด", Icon: Wrench, ic: "text-slate-400" },
    } as const;

    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-[#2B54F0]" />
                    <h2 className="text-base font-bold text-slate-800">สถานะห้องตรวจ</h2>
                </div>
            </div>
            {rooms.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">ยังไม่ได้ตั้งค่าห้องตรวจ</p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {rooms.map((r) => {
                        const c = cfg[r.state];
                        const Icon = c.Icon;
                        return (
                            <div key={r.room_id} className={`rounded-2xl p-3 border flex items-center gap-3 ${c.bg}`}>
                                <div className={`relative h-9 w-9 rounded-xl bg-white flex items-center justify-center ring-1 ${c.ring}`}>
                                    <Icon className={`h-4 w-4 ${c.ic}`} />
                                    <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ring-2 ring-white ${c.dot}`} />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-slate-800 truncate">{r.room_name}</div>
                                    <div className="text-[11px] text-slate-500 truncate">{c.label}{r.detail ? ` · ${r.detail}` : ""}</div>
                                    {r.state === "free" && r.serves && (
                                        <div className="text-[10px] text-emerald-600 truncate mt-0.5">รับ: {r.serves}</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
