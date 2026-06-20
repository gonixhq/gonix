"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Users, UserPlus, Search, Phone, Activity, X,
    UserCircle2, AlertTriangle, ChevronRight, Droplet, Ban, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { PermissionGate } from "@/components/ui/permission-button";
import DeletePatientModal from "./delete-patient-modal";

interface Patient {
    hn: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    gender: "M" | "F" | "other" | null;
    dob: string | null;
    blood_group: string | null;
    nhso_rights: string | null;
    visit_count: number | null;
    last_visit_date: string | null;
    is_active: boolean;
    is_blocked: boolean | null;
    created_at: string;
    photo_url: string | null;
    allergy_summary: string | null;
}

type GenderFilter = "all" | "M" | "F";
type AgeGroup = "all" | "child" | "adult" | "senior";

const NHSO_LABEL: Record<string, string> = {
    none: "ไม่ระบุ",
    self_pay: "ชำระเงินเอง",
    uc: "บัตรทอง",
    sso: "ประกันสังคม",
    gov_officer: "ข้าราชการ",
    private_ins: "ประกันเอกชน",
};

function calculateAge(dob: string | null): number | null {
    if (!dob) return null;
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

function ageGroupOf(age: number | null): AgeGroup | null {
    if (age === null) return null;
    if (age < 18) return "child";
    if (age >= 60) return "senior";
    return "adult";
}

function formatRelative(dateStr: string | null): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diff === 0) return "วันนี้";
    if (diff === 1) return "เมื่อวาน";
    if (diff < 7) return `${diff} วันที่แล้ว`;
    if (diff < 30) return `${Math.floor(diff / 7)} สัปดาห์ที่แล้ว`;
    if (diff < 365) return `${Math.floor(diff / 30)} เดือนที่แล้ว`;
    return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

export default function PatientsClient({ patients, search, isOwner }: { patients: Patient[]; search: string; isOwner?: boolean }) {
    const { t } = useLanguage();
    const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
    const [ageFilter, setAgeFilter] = useState<AgeGroup>("all");
    const [deleteTarget, setDeleteTarget] = useState<{ hn: string; name: string } | null>(null);


    /* ── Apply filters ── */
    const filtered = useMemo(() => {
        return patients.filter((p) => {
            if (genderFilter !== "all" && p.gender !== genderFilter) return false;
            if (ageFilter !== "all") {
                const age = calculateAge(p.dob);
                if (ageGroupOf(age) !== ageFilter) return false;
            }
            return true;
        });
    }, [patients, genderFilter, ageFilter]);

    const isFiltering = genderFilter !== "all" || ageFilter !== "all";

    const stats = useMemo(() => {
        const male = patients.filter((p) => p.gender === "M").length;
        const female = patients.filter((p) => p.gender === "F").length;
        const withVisits = patients.filter((p) => (p.visit_count ?? 0) > 0).length;
        return { total: patients.length, male, female, withVisits };
    }, [patients]);

    return (
        <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-10">
            {/* ── Sub-header — compact (Top Navbar shows page title) ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                        <Users className="h-4 w-4" />
                        ทะเบียนผู้ป่วย
                    </span>
                    <span className="text-slate-300">·</span>
                    <span><span className="font-bold text-slate-700 tabular-nums">{patients.length}</span> ราย</span>
                </p>
                <div className="flex items-center gap-2">
                    {isOwner && (
                        <Link href="/dashboard/patients/deleted-log">
                            <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs h-9 border-red-200 text-red-700 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" /> ประวัติการลบ
                            </Button>
                        </Link>
                    )}
                    <PermissionGate permKey="patients.create">
                        <Link href="/dashboard/patients/new">
                            <Button className="rounded-xl gap-1.5 h-9 px-4 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                                <UserPlus className="h-4 w-4" />
                                {t("addPatient")}
                            </Button>
                        </Link>
                    </PermissionGate>
                </div>
            </div>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "ผู้ป่วยทั้งหมด", value: stats.total, icon: Users, tile: "bg-[#2B54F0]/10", iconColor: "text-[#2B54F0]", glow: "from-[#2B54F0]/20 to-[#5F85FF]/5" },
                    { label: "เพศชาย", value: stats.male, icon: UserCircle2, tile: "bg-[#0EA5A0]/10", iconColor: "text-[#0EA5A0]", glow: "from-[#00FFCC]/25 to-[#0EA5A0]/5" },
                    { label: "เพศหญิง", value: stats.female, icon: UserCircle2, tile: "bg-[#6366F1]/10", iconColor: "text-[#6366F1]", glow: "from-[#6366F1]/20 to-[#8B5CF6]/5" },
                    { label: "เคยมารักษา", value: stats.withVisits, icon: Activity, tile: "bg-[#10B981]/10", iconColor: "text-[#10B981]", glow: "from-[#15FF83]/25 to-[#10B981]/5" },
                ].map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <div key={i} className="gonix-card-premium p-4 relative overflow-hidden">
                            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${s.glow} blur-2xl pointer-events-none`} />
                            <div className="relative">
                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-2.5 ${s.tile}`}>
                                    <Icon className={`h-5 w-5 ${s.iconColor}`} strokeWidth={2.5} />
                                </div>
                                <div className="text-2xl font-extrabold text-slate-800 tabular-nums tracking-tight">{s.value.toLocaleString()}</div>
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mt-0.5">{s.label}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Search + Filter chips ── */}
            <div className="gonix-card-premium p-4 space-y-3">
                <form action="/dashboard/patients" className="relative" method="get">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                        type="search"
                        name="q"
                        defaultValue={search}
                        placeholder="ค้นหา HN, ชื่อ, นามสกุล, หรือเบอร์โทร..."
                        className="w-full pl-11 pr-4 h-11 rounded-xl bg-white border border-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                    />
                </form>

                {/* Filter chips */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500 font-semibold">เพศ:</span>
                    <FilterChip active={genderFilter === "all"} onClick={() => setGenderFilter("all")}>ทั้งหมด</FilterChip>
                    <FilterChip active={genderFilter === "M"} onClick={() => setGenderFilter("M")} color="blue">ชาย</FilterChip>
                    <FilterChip active={genderFilter === "F"} onClick={() => setGenderFilter("F")} color="pink">หญิง</FilterChip>

                    <span className="text-xs text-slate-500 font-semibold ml-3">อายุ:</span>
                    <FilterChip active={ageFilter === "all"} onClick={() => setAgeFilter("all")}>ทั้งหมด</FilterChip>
                    <FilterChip active={ageFilter === "child"} onClick={() => setAgeFilter("child")}>เด็ก (&lt;18)</FilterChip>
                    <FilterChip active={ageFilter === "adult"} onClick={() => setAgeFilter("adult")}>ผู้ใหญ่ (18-59)</FilterChip>
                    <FilterChip active={ageFilter === "senior"} onClick={() => setAgeFilter("senior")}>ผู้สูงอายุ (60+)</FilterChip>

                    {isFiltering && (
                        <button
                            onClick={() => { setGenderFilter("all"); setAgeFilter("all"); }}
                            className="ml-auto text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 underline-offset-2 hover:underline"
                        >
                            <X className="h-3 w-3" /> ล้างตัวกรอง ({filtered.length}/{patients.length})
                        </button>
                    )}
                </div>
            </div>

            {/* ── List ── */}
            {filtered.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <Users className="h-7 w-7 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-700 mb-1">
                        {search ? "ไม่พบผู้ป่วยที่ค้นหา" : isFiltering ? "ไม่มีผู้ป่วยตามตัวกรอง" : "ยังไม่มีข้อมูลผู้ป่วย"}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">
                        {search ? "ลองเปลี่ยนคำค้นหา หรือเพิ่มผู้ป่วยใหม่"
                            : isFiltering ? "ลองเปลี่ยนตัวกรอง หรือล้างตัวกรองทั้งหมด"
                                : "เริ่มต้นโดยการเพิ่มผู้ป่วยรายแรกเข้าสู่ระบบ"}
                    </p>
                    {!search && !isFiltering && (
                        <PermissionGate permKey="patients.create">
                            <Link href="/dashboard/patients/new" className="inline-block mt-5">
                                <Button className="rounded-xl gap-2 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                                    <UserPlus className="h-4 w-4" />
                                    {t("addPatient")}
                                </Button>
                            </Link>
                        </PermissionGate>
                    )}
                </div>
            ) : (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/40">
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider hidden sm:table-cell">HN</th>
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider">ผู้ป่วย</th>
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider hidden lg:table-cell">เบอร์โทร</th>
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider hidden md:table-cell">สิทธิ์</th>
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider">Visit ล่าสุด</th>
                                    <th className="text-center font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider">Visits</th>
                                    <th className="w-8 px-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((pt) => {
                                    const age = calculateAge(pt.dob);
                                    return (
                                        <tr
                                            key={pt.hn}
                                            className="border-b border-slate-50 last:border-0 hover:bg-blue-50/40 transition-colors group cursor-pointer"
                                            onClick={() => window.location.href = `/dashboard/patients/${pt.hn}`}
                                        >
                                            <td className="px-5 py-3 hidden sm:table-cell">
                                                <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                                    {pt.hn}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-bold text-slate-800 group-hover:text-blue-900 transition-colors">
                                                            {pt.first_name} {pt.last_name}
                                                        </span>
                                                        {pt.is_blocked && (
                                                            <Ban className="h-3.5 w-3.5 text-red-600 shrink-0" />
                                                        )}
                                                        {pt.allergy_summary && (
                                                            <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                                                        <span>{pt.gender === "M" ? "ชาย" : pt.gender === "F" ? "หญิง" : "—"}</span>
                                                        {age !== null && (
                                                            <>
                                                                <span className="text-slate-300">·</span>
                                                                <span>{age} ปี</span>
                                                            </>
                                                        )}
                                                        {pt.blood_group && (
                                                            <>
                                                                <span className="text-slate-300">·</span>
                                                                <span className="text-red-600 inline-flex items-center gap-0.5">
                                                                    <Droplet className="h-2.5 w-2.5" />{pt.blood_group}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 hidden lg:table-cell">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
                                                    {pt.phone ? (
                                                        <>
                                                            <Phone className="h-3 w-3 text-slate-400" />
                                                            {pt.phone}
                                                        </>
                                                    ) : (
                                                        <span className="text-slate-300">—</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 hidden md:table-cell">
                                                <span className="text-xs text-slate-600">
                                                    {pt.nhso_rights ? (NHSO_LABEL[pt.nhso_rights] || pt.nhso_rights) : "—"}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="text-xs text-slate-600">
                                                    {formatRelative(pt.last_visit_date)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <span className={`inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-full text-xs font-bold ${
                                                    (pt.visit_count || 0) >= 5
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : (pt.visit_count || 0) > 0
                                                            ? "bg-cyan-100 text-cyan-700"
                                                            : "bg-slate-100 text-slate-500"
                                                }`}>
                                                    <Activity className="h-3 w-3" />
                                                    {pt.visit_count || 0}
                                                </span>
                                            </td>
                                            <td className="px-2 py-3 flex items-center gap-1">
                                                {isOwner && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteTarget({ hn: pt.hn, name: `${pt.first_name} ${pt.last_name}` });
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-all"
                                                        title="ลบผู้ป่วย (Owner only)"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-700 group-hover:translate-x-0.5 transition-all" />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Delete confirmation modal */}
            {deleteTarget && (
                <DeletePatientModal
                    hn={deleteTarget.hn}
                    patientName={deleteTarget.name}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
}

/* ─── Sub-components ─── */

function FilterChip({
    children, active, onClick, color,
}: {
    children: React.ReactNode;
    active: boolean;
    onClick: () => void;
    color?: "blue" | "pink";
}) {
    const activeClass = active
        ? color === "pink" ? "bg-pink-600 text-white"
            : color === "blue" ? "bg-blue-700 text-white"
                : "bg-slate-800 text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200";

    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-xs font-semibold px-3 py-1 rounded-full transition-all ${activeClass}`}
        >
            {children}
        </button>
    );
}

/* unused import kept for tree-shaking comfort */
void UserCircle2;
