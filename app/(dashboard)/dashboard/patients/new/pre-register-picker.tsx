"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    X, Search, Loader2, UserCheck, Phone, IdCard, Calendar,
    Heart, AlertTriangle, MessageCircle, Globe, Smartphone,
    ChevronRight, FileText,
} from "lucide-react";
import {
    listPendingRegistrations, getPendingRegistration, rejectPendingRegistration,
} from "@/lib/actions/pending-registrations";

interface PendingPreview {
    id: string;
    source: string;
    prefix: string | null;
    first_name: string;
    last_name: string;
    dob: string | null;
    gender: string | null;
    phone: string;
    email: string | null;
    thai_id_card: string | null;
    blood_group: string | null;
    allergy_summary: string | null;
    disease_summary: string | null;
    pdpa_consent: boolean;
    created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PendingFull = any;

const SOURCE_LABEL: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    online_form: { label: "Online Form", icon: Globe, color: "bg-blue-100 text-blue-700" },
    line_oa: { label: "LINE OA", icon: MessageCircle, color: "bg-green-100 text-green-700" },
    kiosk: { label: "Kiosk", icon: Smartphone, color: "bg-purple-100 text-purple-700" },
};

interface Props {
    open: boolean;
    onClose: () => void;
    onPick: (data: PendingFull) => void;
}

export default function PreRegisterPicker({ open, onClose, onPick }: Props) {
    const [items, setItems] = useState<PendingPreview[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [error, setError] = useState("");
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const load = useCallback(async (q?: string) => {
        setLoading(true);
        setError("");
        const res = await listPendingRegistrations(q);
        setLoading(false);
        if (!res.success) {
            setError(res.error || "เกิดข้อผิดพลาด");
            return;
        }
        setItems(res.data as PendingPreview[]);
    }, []);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    // Debounce search
    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => load(search), 300);
        return () => clearTimeout(t);
    }, [search, open, load]);

    async function handlePick(id: string) {
        setLoading(true);
        const res = await getPendingRegistration(id);
        setLoading(false);
        if (!res.success || !res.data) {
            alert(res.error || "ไม่พบข้อมูล");
            return;
        }
        onPick(res.data);
        onClose();
    }

    async function handleReject(id: string, name: string) {
        if (!confirm(`ยกเลิกการลงทะเบียนของ "${name}"?`)) return;
        const res = await rejectPendingRegistration(id);
        if (!res.success) { alert(res.error || "ลบไม่สำเร็จ"); return; }
        await load(search);
    }

    function calcAge(dob: string | null): string {
        if (!dob) return "—";
        const d = new Date(dob);
        const now = new Date();
        let y = now.getFullYear() - d.getFullYear();
        if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y--;
        return `${y} ปี`;
    }

    function timeAgo(timestamp: string): string {
        const diff = Date.now() - new Date(timestamp).getTime();
        const min = Math.floor(diff / 60000);
        if (min < 1) return "เมื่อกี้";
        if (min < 60) return `${min} นาทีที่แล้ว`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr} ชม.ที่แล้ว`;
        const day = Math.floor(hr / 24);
        if (day < 7) return `${day} วันที่แล้ว`;
        return new Date(timestamp).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
    }

    if (!open || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-600" />
                            ผู้ป่วยลงทะเบียนล่วงหน้า
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            เลือกรายการเพื่อดึงข้อมูลไปกรอกฟอร์มลงทะเบียนผู้ป่วยใหม่
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาชื่อ, เบอร์โทร, หรือเลขบัตร..."
                            className="pl-9 h-10 rounded-xl"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-5">
                    {error && (
                        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" /> {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-slate-400">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            <span className="text-sm">กำลังโหลด...</span>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-400">
                                {search ? "ไม่พบผู้ป่วยที่ค้นหา" : "ยังไม่มีผู้ป่วยลงทะเบียนล่วงหน้า"}
                            </p>
                            {!search && (
                                <p className="text-xs text-slate-400 mt-2">
                                    📲 ส่งลิงก์ลงทะเบียนให้ผู้ป่วยกรอกผ่าน LINE OA / เว็บไซต์ก่อนมาถึงคลินิก
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {items.map(item => {
                                const sourceMeta = SOURCE_LABEL[item.source] || SOURCE_LABEL.online_form;
                                const SourceIcon = sourceMeta.icon;
                                const fullName = `${item.prefix || ""} ${item.first_name} ${item.last_name}`.trim();
                                return (
                                    <div key={item.id}
                                        className="group relative rounded-2xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer p-4"
                                        onClick={() => handlePick(item.id)}
                                    >
                                        {/* Source badge */}
                                        <div className="absolute top-3 right-3 flex items-center gap-2">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sourceMeta.color}`}>
                                                <SourceIcon className="h-3 w-3" /> {sourceMeta.label}
                                            </span>
                                            <span className="text-[10px] text-slate-400">{timeAgo(item.created_at)}</span>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            {/* Avatar circle */}
                                            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold text-lg shrink-0">
                                                {item.first_name.charAt(0)}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                {/* Name */}
                                                <div className="text-base font-bold text-slate-800 truncate pr-32">
                                                    {fullName}
                                                </div>

                                                {/* Meta row */}
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-600">
                                                    <span className="inline-flex items-center gap-1">
                                                        <Calendar className="h-3 w-3 text-slate-400" />
                                                        {calcAge(item.dob)}
                                                    </span>
                                                    {item.gender && (
                                                        <span>{item.gender === "M" ? "ชาย" : item.gender === "F" ? "หญิง" : "อื่นๆ"}</span>
                                                    )}
                                                    {item.blood_group && (
                                                        <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                                                            <Heart className="h-3 w-3" /> {item.blood_group}
                                                        </span>
                                                    )}
                                                    {item.pdpa_consent && (
                                                        <span className="text-emerald-700 text-[10px] font-bold uppercase tracking-wider">✓ PDPA</span>
                                                    )}
                                                </div>

                                                {/* Contact + ID */}
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                                                    <span className="inline-flex items-center gap-1 font-mono">
                                                        <Phone className="h-3 w-3" /> {item.phone}
                                                    </span>
                                                    {item.thai_id_card && (
                                                        <span className="inline-flex items-center gap-1 font-mono">
                                                            <IdCard className="h-3 w-3" /> {item.thai_id_card}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Allergy alert */}
                                                {item.allergy_summary && (
                                                    <div className="mt-2 text-xs text-red-700 font-semibold inline-flex items-center gap-1">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        แพ้: {item.allergy_summary}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleReject(item.id, fullName); }}
                                                className="text-[11px] text-red-600 hover:underline font-medium"
                                            >
                                                ยกเลิก
                                            </button>
                                            <Button size="sm" className="rounded-lg h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700">
                                                <UserCheck className="h-3.5 w-3.5" /> ดึงข้อมูล
                                                <ChevronRight className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                        📲 ส่งลิงก์ <code className="text-blue-700 bg-blue-50 px-1 rounded">/register</code> ให้ผู้ป่วยลงทะเบียนล่วงหน้า
                    </p>
                    <Button variant="outline" size="sm" onClick={onClose} className="rounded-lg">ปิด</Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
