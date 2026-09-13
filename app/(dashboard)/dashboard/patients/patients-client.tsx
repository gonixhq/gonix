"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Users, UserPlus, Search, Phone, Activity, X,
    UserCircle2, AlertTriangle, Droplet, Ban, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { PermissionGate } from "@/components/ui/permission-button";
import DeletePatientModal from "./delete-patient-modal";

interface Patient {
    hn: string;
    prefix?: string | null;
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

export default function PatientsClient({ patients, search, isOwner, gender, age, page, pageSize, total, loadError }: {
    patients: Patient[]; search: string; isOwner?: boolean; gender: string; age: string;
    page: number; pageSize: number; total: number; loadError: boolean;
}) {
    const { t } = useLanguage();
    const router = useRouter();
    const [deleteTarget, setDeleteTarget] = useState<{ hn: string; name: string } | null>(null);
    const genderFilter = gender, ageFilter = age;
    const filtered = patients;
    const isFiltering = gender !== "all" || age !== "all";
    const url = (changes: Record<string, string>) => {
        const params = new URLSearchParams({ q: search, gender, age, page: String(page), ...changes });
        return `/dashboard/patients?${params}`;
    };
    const setGenderFilter = (value: string) => router.push(url({ gender: value, page: "1" }));
    const setAgeFilter = (value: string) => router.push(url({ age: value, page: "1" }));
    const pages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="space-y-5 max-w-7xl mx-auto p-4 sm:p-6 pb-10 rounded-3xl bg-white/35 border border-white/60">
            {/* ── Sub-header — compact (Top Navbar shows page title) ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                        <Users className="h-4 w-4" />
                        ทะเบียนผู้ป่วย
                    </span>
                    <span className="text-slate-300">·</span>
                    <span><span className="font-bold text-slate-700 tabular-nums">{total.toLocaleString()}</span> ราย{search || isFiltering ? "ที่ตรงกับการค้นหา" : "ทั้งหมด"}</span>
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
                            <Button className="rounded-xl gap-1.5 h-9 px-4 bg-blue-700 hover:bg-blue-800 text-white shadow-sm shadow-blue-500/10">
                                <UserPlus className="h-4 w-4" />
                                {t("addPatient")}
                            </Button>
                        </Link>
                    </PermissionGate>
                </div>
            </div>

            {/* ── Search + Filter chips ── */}
            <div className="gonix-card-premium p-4 space-y-3">
                <form action="/dashboard/patients" className="relative" method="get">
                    <input type="hidden" name="gender" value={gender} /><input type="hidden" name="age" value={age} />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                        type="search"
                        name="q"
                        aria-label="ค้นหาผู้ป่วย"
                        defaultValue={search}
                        placeholder="ค้นหา HN, ชื่อ, นามสกุล, หรือเบอร์โทร..."
                        className="w-full pl-11 pr-24 h-11 rounded-xl bg-white border border-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm">ค้นหา</button>
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
                            onClick={() => { router.push(url({ gender: "all", age: "all", page: "1" })); }}
                            className="ml-auto text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 underline-offset-2 hover:underline"
                        >
                            <X className="h-3 w-3" /> ล้างตัวกรอง
                        </button>
                    )}
                </div>
            </div>

            {/* ── List ── */}
            {loadError ? <div role="alert" className="gonix-card-premium p-8 text-center text-slate-700">โหลดทะเบียนผู้ป่วยไม่สำเร็จ กรุณาลองใหม่ <button className="text-blue-700 underline" onClick={() => router.refresh()}>ลองอีกครั้ง</button></div> : filtered.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <Users className="h-7 w-7 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-700 mb-1">
                        {page > 1 ? "ไม่มีข้อมูลในหน้านี้" : search ? "ไม่พบผู้ป่วยที่ค้นหา" : isFiltering ? "ไม่มีผู้ป่วยตามตัวกรอง" : "ยังไม่มีข้อมูลผู้ป่วย"}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">
                        {search ? "ลองเปลี่ยนคำค้นหา หรือเพิ่มผู้ป่วยใหม่"
                            : isFiltering ? "ลองเปลี่ยนตัวกรอง หรือล้างตัวกรองทั้งหมด"
                                : "เริ่มต้นโดยการเพิ่มผู้ป่วยรายแรกเข้าสู่ระบบ"}
                    </p>
                    {!search && !isFiltering && (
                        <PermissionGate permKey="patients.create">
                            <Link href="/dashboard/patients/new" className="inline-block mt-5">
                                <Button className="rounded-xl gap-2 bg-blue-700 hover:bg-blue-800 text-white shadow-sm shadow-blue-500/10">
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
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 text-sm hidden sm:table-cell">HN</th>
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 text-sm">ผู้ป่วย</th>
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 text-sm hidden lg:table-cell">เบอร์โทร</th>
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 text-sm hidden md:table-cell">สิทธิ์</th>
                                    <th className="text-left font-bold text-slate-500 px-5 py-3 text-sm">Visit ล่าสุด</th>
                                    <th className="text-center font-bold text-slate-500 px-5 py-3 text-sm">จำนวนครั้ง</th>
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
                                            onClick={() => router.push(`/dashboard/patients/${pt.hn}`)}
                                        >
                                            <td className="px-5 py-2 hidden sm:table-cell">
                                                <span className="font-mono text-sm text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                                    {pt.hn}
                                                </span>
                                            </td>
                                            <td className="px-5 py-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <Link href={`/dashboard/patients/${pt.hn}`} className="text-base font-semibold text-slate-800 group-hover:text-blue-900 transition-colors">
                                                            {pt.prefix}{pt.first_name} {pt.last_name}
                                                        </Link>
                                                        {pt.is_blocked && (
                                                            <Ban className="h-3.5 w-3.5 text-red-600 shrink-0" />
                                                        )}
                                                        {pt.allergy_summary && !["-", "—", "ไม่มี", "ยังไม่ระบุ"].includes(pt.allergy_summary.trim()) && (
                                                            <span title={pt.allergy_summary}><AlertTriangle aria-label="มีประวัติแพ้ยา" className="h-4 w-4 text-red-600 shrink-0" /></span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                                                        <span className="sm:hidden font-mono text-sm text-blue-700">{pt.hn}</span>
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
                                            <td className="px-5 py-2 hidden lg:table-cell">
                                                <div className="flex items-center gap-1.5 text-sm text-slate-700 font-mono">
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
                                            <td className="px-5 py-2 hidden md:table-cell">
                                                <span className="text-xs text-slate-600">
                                                    {pt.nhso_rights ? (NHSO_LABEL[pt.nhso_rights] || pt.nhso_rights) : "—"}
                                                </span>
                                            </td>
                                            <td className="px-5 py-2">
                                                <span className="text-xs text-slate-600">
                                                    {formatRelative(pt.last_visit_date)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-2 text-center">
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
                                            <td className="px-2 py-2"><div className="flex items-center gap-2 whitespace-nowrap">
                                                {!pt.is_blocked && <PermissionGate permKey="visits.create"><Link
                                                    href={`/dashboard/visits/new?hn=${encodeURIComponent(pt.hn)}`}
                                                    onClick={e => e.stopPropagation()}
                                                    className="px-3 py-2 rounded-xl border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium">เปิด Visit</Link></PermissionGate>}
                                                {isOwner && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteTarget({ hn: pt.hn, name: `${pt.first_name} ${pt.last_name}` });
                                                        }}
                                                        className="p-2 rounded-lg hover:bg-red-100 text-red-500 transition-all"
                                                        title="ลบผู้ป่วย (Owner only)"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!loadError && <nav aria-label="หน้าทะเบียนผู้ป่วย" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                <span>{patients.length ? `${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + patients.length} จาก ${total.toLocaleString()} ราย` : `${total.toLocaleString()} ราย`} · หน้าละ {pageSize} ราย</span>
                <div className="flex items-center gap-3">
                    {page > 1 && <Link className="px-3 py-2 bg-white rounded-xl border" href={url({ page: String(Math.min(page - 1, pages)) })}>ก่อนหน้า</Link>}
                    <span>หน้า {page} / {pages}</span>
                    {page < pages && <Link className="px-3 py-2 bg-white rounded-xl border text-blue-700" href={url({ page: String(page + 1) })}>ถัดไป</Link>}
                </div>
            </nav>}
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
    children, active, onClick,
}: {
    children: React.ReactNode;
    active: boolean;
    onClick: () => void;
    color?: "blue" | "pink";
}) {
    const activeClass = active
        ? "bg-blue-700 text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200";

    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={`text-sm font-medium px-3 py-2 rounded-xl transition-all ${activeClass}`}
        >
            {children}
        </button>
    );
}

/* unused import kept for tree-shaking comfort */
void UserCircle2;
