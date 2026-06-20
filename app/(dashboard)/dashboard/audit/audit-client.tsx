"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    History, CheckCircle2, XCircle, RefreshCw, PencilLine, Power,
    Search, Filter, Clock, ArrowRight,
} from "lucide-react";

type ActionType = "approve" | "reject" | "reapprove" | "change_role" | "disable" | "enable";

export interface ActivityEntry {
    id: string;
    action: ActionType;
    details: Record<string, unknown>;
    created_at: string;
    actor_name: string;
    actor_role: string | null;
    target_name: string;
    target_role: string | null;
}

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของคลินิก", admin: "แอดมิน",
    doctor: "แพทย์", dentist: "ทันตแพทย์", nurse: "พยาบาล",
    pharmacist: "เภสัชกร", physio: "นักกายภาพ",
    receptionist: "เจ้าหน้าที่ต้อนรับ", accountant: "เจ้าหน้าที่บัญชี",
};

const ACTION_META: Record<ActionType, {
    label: string; icon: React.ElementType; color: string; bg: string;
}> = {
    approve: { label: "อนุมัติ", icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-100" },
    reject: { label: "ปฏิเสธ", icon: XCircle, color: "text-red-700", bg: "bg-red-100" },
    reapprove: { label: "อนุมัติใหม่", icon: RefreshCw, color: "text-emerald-700", bg: "bg-emerald-100" },
    change_role: { label: "เปลี่ยน Role", icon: PencilLine, color: "text-blue-700", bg: "bg-blue-100" },
    disable: { label: "ปิดบัญชี", icon: Power, color: "text-slate-700", bg: "bg-slate-200" },
    enable: { label: "เปิดบัญชี", icon: Power, color: "text-emerald-700", bg: "bg-emerald-100" },
};

function relativeTime(iso: string): string {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "เมื่อสักครู่";
    if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
    return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default function AuditClient({ entries }: { entries: ActivityEntry[] }) {
    const [search, setSearch] = useState("");
    const [filterAction, setFilterAction] = useState<ActionType | "all">("all");

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return entries.filter((e) => {
            if (filterAction !== "all" && e.action !== filterAction) return false;
            if (q && !(e.actor_name.toLowerCase().includes(q) || e.target_name.toLowerCase().includes(q))) return false;
            return true;
        });
    }, [entries, search, filterAction]);

    // Group by date
    const groups = useMemo(() => {
        const map = new Map<string, ActivityEntry[]>();
        for (const e of filtered) {
            const day = new Date(e.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
            if (!map.has(day)) map.set(day, []);
            map.get(day)!.push(e);
        }
        return Array.from(map.entries());
    }, [filtered]);

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            {/* Sub-header — compact */}
            <p className="text-sm font-medium text-slate-500 pt-1">
                <span className="font-bold text-blue-700">Activity Log</span>
                <span className="text-slate-300 mx-2">·</span>
                บันทึกการอนุมัติ · เปลี่ยน role · เปิด/ปิดบัญชี
            </p>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นหาชื่อผู้ทำ/ผู้ถูกกระทำ..."
                        className="pl-9 rounded-xl bg-white/70 backdrop-blur-md border-white/80"
                    />
                </div>
                <div className="flex items-center gap-2 bg-white/70 backdrop-blur-md border border-white/80 rounded-xl px-3">
                    <Filter className="h-4 w-4 text-slate-400" />
                    <select
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value as ActionType | "all")}
                        className="h-10 bg-transparent text-sm font-medium focus:outline-none pr-2"
                    >
                        <option value="all">ทุกประเภท</option>
                        {Object.entries(ACTION_META).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Empty / List */}
            {filtered.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2">
                    <CardContent className="p-12 text-center">
                        <History className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="font-semibold text-slate-700 mb-1">ไม่พบประวัติการดำเนินการ</h3>
                        <p className="text-sm text-slate-500">
                            {entries.length === 0
                                ? "ยังไม่มีการกระทำใด ๆ ที่ถูกบันทึก"
                                : "ลองเปลี่ยนคำค้นหา หรือเลือกประเภทอื่น"}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {groups.map(([day, items]) => (
                        <div key={day}>
                            <div className="flex items-center gap-2 mb-3 pl-1">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{day}</h3>
                                <div className="flex-1 h-px bg-slate-200/60" />
                                <span className="text-xs text-slate-400">{items.length} รายการ</span>
                            </div>
                            <div className="space-y-2">
                                {items.map((e) => <ActivityRow key={e.id} entry={e} />)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
    const meta = ACTION_META[entry.action];
    const Icon = meta.icon;

    return (
        <div className="gonix-card-premium p-4 flex items-start gap-4">
            <div className={`h-10 w-10 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center shrink-0`}>
                <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-slate-800">{entry.actor_name}</span>
                    {entry.actor_role && (
                        <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-0">
                            {ROLE_LABEL[entry.actor_role] || entry.actor_role}
                        </Badge>
                    )}
                    <span className="text-slate-500">→</span>
                    <Badge className={`text-xs border-0 ${meta.bg} ${meta.color}`}>{meta.label}</Badge>
                    <span className="text-slate-500">→</span>
                    <span className="font-bold text-slate-800">{entry.target_name}</span>
                </div>
                <ActivityDetails entry={entry} />
                <div className="text-xs text-slate-400 mt-1.5">{relativeTime(entry.created_at)}</div>
            </div>
        </div>
    );
}

function ActivityDetails({ entry }: { entry: ActivityEntry }) {
    const d = entry.details as Record<string, unknown>;

    if (entry.action === "approve") {
        const requested = d.requested_role ? (ROLE_LABEL[d.requested_role as string] || d.requested_role) : null;
        const final = d.final_role ? (ROLE_LABEL[d.final_role as string] || d.final_role) : null;
        if (requested && final && requested !== final) {
            return (
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <span>{requested as string}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-semibold text-slate-700">{final as string}</span>
                </div>
            );
        }
        if (final) {
            return <div className="text-xs text-slate-500 mt-1">เป็น {final as string}</div>;
        }
    }

    if (entry.action === "reject" && d.reason) {
        return (
            <div className="text-xs text-red-700 mt-1 bg-red-50/60 rounded-lg px-2 py-1 inline-block">
                เหตุผล: {d.reason as string}
            </div>
        );
    }

    if (entry.action === "change_role") {
        const from = d.from ? (ROLE_LABEL[d.from as string] || d.from) : "—";
        const to = d.to ? (ROLE_LABEL[d.to as string] || d.to) : "—";
        return (
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span>{from as string}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="font-semibold text-slate-700">{to as string}</span>
            </div>
        );
    }

    if (entry.action === "reapprove" && d.final_role) {
        const final = ROLE_LABEL[d.final_role as string] || d.final_role;
        return <div className="text-xs text-slate-500 mt-1">เป็น {final as string}</div>;
    }

    return null;
}
