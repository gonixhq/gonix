"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
    ArrowLeft, Search, UserCheck, Loader2, CheckCircle, AlertCircle,
    X, Droplet, AlertTriangle, ChevronRight, Heart, ChevronDown, Check,
    Stethoscope, Sparkles, Bandage, FileText, HeartPulse, TestTube,
} from "lucide-react";
import { registerVisitWithScreening } from "@/lib/actions/visit-register";
import { listAffiliates, type Affiliate } from "@/lib/actions/affiliates";
import { SERVICE_LABEL, type ServiceCategory } from "@/lib/visit-service-types";

type CaseSource = "walk_in" | "line" | "affiliate" | "referral";

interface PatientSearchResult {
    hn: string;
    prefix: string | null;
    first_name: string;
    last_name: string;
    phone: string | null;
    gender: string | null;
    dob: string | null;
    blood_group: string | null;
    allergy_summary: string | null;
    disease_summary: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relation: string | null;
    patient_allergies?: { allergen_name: string; severity: string; is_active: boolean }[];
    patient_chronic_diseases?: { disease_name: string }[];
}

const SERVICE_OPTIONS: {
    value: ServiceCategory;
    label: string;
    icon: React.ElementType;
    text: string;
    bg: string;
}[] = [
    { value: "general_med", label: "เวชกรรมทั่วไป", icon: Stethoscope, text: "text-blue-700", bg: "bg-blue-50" },
    { value: "aesthetic", label: "ความงาม / หัตถการ", icon: Sparkles, text: "text-pink-700", bg: "bg-pink-50" },
    { value: "wound_care", label: "ทำแผล / ล้างแผล", icon: Bandage, text: "text-amber-700", bg: "bg-amber-50" },
    { value: "med_cert", label: "ขอใบรับรองแพทย์", icon: FileText, text: "text-emerald-700", bg: "bg-emerald-50" },
    { value: "checkup", label: "ตรวจสุขภาพ", icon: HeartPulse, text: "text-purple-700", bg: "bg-purple-50" },
    { value: "std_test", label: "ตรวจเลือด STD", icon: TestTube, text: "text-rose-700", bg: "bg-rose-50" },
];

function calcAge(dob: string | null): string {
    if (!dob) return "—";
    const d = new Date(dob);
    const now = new Date();
    let y = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y--;
    return `${y}`;
}

export default function NewVisitPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    const [searchQ, setSearchQ] = useState("");
    const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [serviceCategory, setServiceCategory] = useState<ServiceCategory>("general_med");
    const [medCertType, setMedCertType] = useState("sick_leave");
    const [briefNote, setBriefNote] = useState("");
    // ที่มาของเคส (บังคับ)
    const [caseSource, setCaseSource] = useState<CaseSource | "">("");
    const [caseAffiliateId, setCaseAffiliateId] = useState("");
    const [caseReferralCode, setCaseReferralCode] = useState("");
    const [affiliates, setAffiliates] = useState<Affiliate[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        const hnParam = searchParams.get("hn");
        if (hnParam && !selectedPatient) {
            (async () => {
                const { data } = await supabase.from("patients")
                    .select("hn, prefix, first_name, last_name, phone, gender, dob, blood_group, allergy_summary, disease_summary, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, patient_allergies(allergen_name, severity, is_active), patient_chronic_diseases(disease_name)")
                    .eq("hn", hnParam).maybeSingle();
                if (data) setSelectedPatient(data);
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const doSearch = useCallback((q: string) => {
        setSearchQ(q);
        if (q.length < 2) { setSearchResults([]); setShowResults(false); return; }
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            const { data } = await supabase.from("patients")
                .select("hn, prefix, first_name, last_name, phone, gender, dob, blood_group, allergy_summary, disease_summary, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, patient_allergies(allergen_name, severity, is_active), patient_chronic_diseases(disease_name)")
                .or(`hn.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
                .eq("is_active", true)
                .limit(10);
            setSearchResults((data || []) as PatientSearchResult[]);
            setShowResults(true);
        }, 300);
    }, [supabase]);

    function pickPatient(p: PatientSearchResult) {
        setSelectedPatient(p);
        setSearchQ("");
        setSearchResults([]);
        setShowResults(false);
    }

    useEffect(() => {
        if (caseSource === "affiliate" && affiliates.length === 0) {
            listAffiliates().then(a => setAffiliates(a.filter(x => x.is_active)));
        }
    }, [caseSource, affiliates.length]);

    async function handleSubmit() {
        if (!selectedPatient) { setError("กรุณาเลือกผู้ป่วยก่อน"); return; }
        if (!caseSource) { setError("กรุณาเลือก “ที่มาของเคส” ก่อนบันทึก"); return; }
        if (caseSource === "affiliate" && !caseAffiliateId) { setError("เลือกเซลล์ฟรีแลนซ์ก่อน"); return; }
        if (caseSource === "referral" && !caseReferralCode.trim()) { setError("กรอกรหัสลูกค้าแนะนำก่อน"); return; }
        setSubmitting(true);
        setError("");

        try {
            const res = await registerVisitWithScreening({
                hn: selectedPatient.hn,
                service_category: serviceCategory,
                med_cert_type: serviceCategory === "med_cert" ? medCertType : undefined,
                chief_complaint: briefNote || undefined,
                triage_level: "normal",
                send_to_doctor: false,  // ส่งเข้าคิวซักประวัติ (status = triaged)
                case_source: caseSource,
                case_affiliate_id: caseSource === "affiliate" ? caseAffiliateId : null,
                case_referral_code: caseSource === "referral" ? caseReferralCode : null,
            });

            if (!res.success) {
                console.error("[visits/new] register failed:", res.error);
                setError(res.error || "เกิดข้อผิดพลาด — ไม่ทราบสาเหตุ");
                return;
            }

            setSuccess(`✓ สร้าง Visit สำเร็จ! VN: ${res.vn} — ส่งเข้าคิวซักประวัติแล้ว`);
            setTimeout(() => router.push("/dashboard/screening"), 1200);
        } catch (e) {
            console.error("[visits/new] submit exception:", e);
            setError(e instanceof Error ? e.message : "Network error — ลองใหม่อีกครั้ง");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="space-y-4 animate-fade-in max-w-3xl mx-auto pb-20">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/dashboard/screening">
                    <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-lg font-bold text-slate-800">สร้าง Visit ใหม่</h1>
                    <p className="text-xs text-slate-500">เคาท์เตอร์ลงทะเบียน → ส่งเข้าคิวซักประวัติพยาบาล</p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0" /> {success}
                </div>
            )}

            {/* Step 1: Patient */}
            <div className="gonix-card-premium p-4 space-y-3 relative z-50">
                <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-sm font-bold flex items-center justify-center shadow-sm shadow-blue-500/30">1</span>
                    <Label className="text-sm font-bold text-slate-800">เลือกผู้ป่วย</Label>
                </div>

                {!selectedPatient ? (
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                value={searchQ}
                                onChange={e => doSearch(e.target.value)}
                                placeholder="ค้นหา HN, ชื่อ, นามสกุล, หรือเบอร์โทร..."
                                className="pl-9 h-11 rounded-xl text-base"
                                autoFocus
                            />
                            {showResults && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-72 overflow-y-auto">
                                    {searchResults.map(p => (
                                        <button key={p.hn} type="button" onClick={() => pickPatient(p)}
                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-0 flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                                                {p.first_name?.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-800 truncate">
                                                    {p.prefix} {p.first_name} {p.last_name}
                                                </div>
                                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                                    <span className="font-mono">{p.hn}</span>
                                                    {p.phone && <><span>·</span><span>{p.phone}</span></>}
                                                    <span>·</span><span>{calcAge(p.dob)} ปี</span>
                                                </div>
                                            </div>
                                            {p.allergy_summary && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <Link href="/dashboard/patients/new">
                            <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-11 shrink-0 px-4">
                                <UserCheck className="h-4 w-4" /> ลงทะเบียนใหม่
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="rounded-xl bg-blue-50 border-2 border-blue-300 overflow-hidden">
                        {/* Top: Identity */}
                        <div className="flex items-center gap-3 p-3">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/20 shrink-0">
                                {selectedPatient.first_name?.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-bold text-slate-800">
                                        {selectedPatient.prefix} {selectedPatient.first_name} {selectedPatient.last_name}
                                    </span>
                                    <span className="font-mono text-sm font-bold text-blue-700">{selectedPatient.hn}</span>
                                </div>
                                <div className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap mt-0.5">
                                    <span>{selectedPatient.gender === "M" ? "ชาย" : selectedPatient.gender === "F" ? "หญิง" : "—"}</span>
                                    <span>·</span><span>{calcAge(selectedPatient.dob)} ปี</span>
                                    {selectedPatient.blood_group && (
                                        <>
                                            <span>·</span>
                                            <span className="inline-flex items-center gap-0.5 text-red-700 font-semibold">
                                                <Droplet className="h-2.5 w-2.5" /> {selectedPatient.blood_group}
                                            </span>
                                        </>
                                    )}
                                    {selectedPatient.phone && <><span>·</span><span className="font-mono">{selectedPatient.phone}</span></>}
                                </div>
                            </div>
                            <button onClick={() => setSelectedPatient(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Bottom: Warnings (allergy + chronic + emergency) */}
                        {(() => {
                            const activeAllergies = (selectedPatient.patient_allergies || []).filter(a => a.is_active);
                            const chronicList = selectedPatient.patient_chronic_diseases || [];
                            const allergyText = [
                                selectedPatient.allergy_summary,
                                ...activeAllergies.map(a => a.allergen_name),
                            ].filter(Boolean).join(", ");
                            const chronicText = [
                                selectedPatient.disease_summary,
                                ...chronicList.map(d => d.disease_name),
                            ].filter(Boolean).join(", ");
                            const hasAny = allergyText || chronicText || selectedPatient.emergency_contact_name;
                            if (!hasAny) return null;

                            return (
                            <div className="bg-white border-t border-blue-200 p-3 space-y-1.5">
                                {allergyText && (
                                    <div className="flex items-start gap-2 text-sm">
                                        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold text-red-700">⚠ แพ้: </span>
                                            <span className="text-red-800 font-semibold">{allergyText}</span>
                                        </div>
                                    </div>
                                )}
                                {chronicText && (
                                    <div className="flex items-start gap-2 text-sm">
                                        <Heart className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold text-amber-700">โรคประจำตัว: </span>
                                            <span className="text-amber-800 font-semibold">{chronicText}</span>
                                        </div>
                                    </div>
                                )}
                                {selectedPatient.emergency_contact_name && (
                                    <div className="flex items-start gap-2 text-xs text-slate-600">
                                        <AlertCircle className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-semibold">ติดต่อฉุกเฉิน: </span>
                                            {selectedPatient.emergency_contact_name}
                                            {selectedPatient.emergency_contact_relation && (
                                                <span className="text-slate-400"> ({selectedPatient.emergency_contact_relation})</span>
                                            )}
                                            {selectedPatient.emergency_contact_phone && (
                                                <span className="ml-1 font-mono">· {selectedPatient.emergency_contact_phone}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Step 2: Service */}
            <div className="gonix-card-premium p-4 space-y-3 relative z-40">
                <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-sm font-bold flex items-center justify-center shadow-sm shadow-blue-500/30">2</span>
                    <Label className="text-sm font-bold text-slate-800">ประเภทบริการ</Label>
                </div>
                <ServiceCategoryPicker value={serviceCategory} onChange={setServiceCategory} />

                {serviceCategory === "med_cert" && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5">
                        <Label className="text-xs font-bold text-emerald-800">ประเภทใบรับรอง (สร้าง draft ให้หมอ verify)</Label>
                        <select value={medCertType} onChange={e => setMedCertType(e.target.value)}
                            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                            <option value="sick_leave">ลาป่วย</option>
                            <option value="fit_for_work">ร่างกายปกติ / พร้อมทำงาน</option>
                            <option value="fitness">ตรวจสุขภาพทั่วไป</option>
                            <option value="driving">ขอใบขับขี่</option>
                            <option value="government">ราชการ</option>
                            <option value="insurance">ประกัน</option>
                            <option value="other">อื่นๆ</option>
                        </select>
                        <p className="text-[11px] text-slate-500">ระบบจะสร้าง draft ใบรับรองไว้ล่วงหน้า — หมอเปิด Visit จะเห็นในแท็บใบรับรองทันที กด Approve/แก้ไขได้เลย</p>
                    </div>
                )}

                {/* ที่มาของเคส (บังคับ) */}
                <div className="pt-3 border-t border-slate-100">
                    <Label className="text-sm font-bold text-slate-800">ที่มาของเคส <span className="text-rose-500">*</span></Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        {([["walk_in", "Walk-in"], ["line", "จองผ่าน LINE"], ["affiliate", "เซลล์ฟรีแลนซ์"], ["referral", "ลูกค้าแนะนำ"]] as const).map(([k, l]) => (
                            <button key={k} type="button" onClick={() => setCaseSource(k)}
                                className={`h-10 rounded-xl text-xs font-bold transition-all ${caseSource === k ? "bg-[#2B54F0] text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                                {l}
                            </button>
                        ))}
                    </div>
                    {caseSource === "affiliate" && (
                        <select value={caseAffiliateId} onChange={e => setCaseAffiliateId(e.target.value)}
                            className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30">
                            <option value="">— เลือกเซลล์ —</option>
                            {affiliates.map(a => <option key={a.id} value={a.id}>{a.name} ({a.referral_code})</option>)}
                        </select>
                    )}
                    {caseSource === "referral" && (
                        <input value={caseReferralCode} onChange={e => setCaseReferralCode(e.target.value.toUpperCase())}
                            placeholder="รหัสลูกค้าแนะนำ (RFxxxxx)" className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm mt-2 font-mono focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" />
                    )}
                    {!caseSource && <p className="text-[11px] text-rose-500 mt-1.5">⚠ ต้องเลือกที่มาของเคสก่อนเปิด visit</p>}
                </div>
            </div>

            {/* Step 3: Brief Note (optional) */}
            <div className="gonix-card-premium p-4 space-y-2 relative z-10">
                <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-sm font-bold flex items-center justify-center shadow-sm shadow-blue-500/30">3</span>
                    <Label className="text-sm font-bold text-slate-800">หมายเหตุเบื้องต้น <span className="text-xs font-normal text-slate-400">(ถ้ามี)</span></Label>
                </div>
                <textarea value={briefNote} onChange={e => setBriefNote(e.target.value)}
                    placeholder="เช่น คนไข้นัด, โทรมาเล่าอาการ, ขอใบรับรองอย่างเดียว..."
                    rows={2}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none" />
                <p className="text-[11px] text-slate-500">
                    💡 พยาบาลจะซักประวัติเต็มในขั้นตอนต่อไป
                </p>
            </div>

            {/* Submit */}
            <div className="sticky bottom-4 z-20">
                <div className="rounded-xl bg-white border-2 border-slate-300 shadow-2xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 min-w-0 truncate">
                        {selectedPatient ? (
                            <>
                                <strong className="text-slate-800">{selectedPatient.first_name} {selectedPatient.last_name}</strong>{" "}
                                <span className="text-blue-700 font-mono">({selectedPatient.hn})</span>{" "}
                                · <strong>{SERVICE_LABEL[serviceCategory]}</strong>
                            </>
                        ) : (
                            <span className="text-slate-400 italic">เลือกผู้ป่วยก่อน</span>
                        )}
                    </div>
                    <Button size="lg" disabled={!selectedPatient || !caseSource || submitting} onClick={handleSubmit}
                        className="rounded-xl gap-1.5 h-11 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 shadow-md shadow-blue-500/25 min-w-[140px] text-white">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        เปิด Visit <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

/* ═══════ ServiceCategoryPicker — Custom dropdown (consistent with screening page) ═══════ */
function ServiceCategoryPicker({
    value, onChange,
}: { value: ServiceCategory; onChange: (v: ServiceCategory) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const current = SERVICE_OPTIONS.find(o => o.value === value) || SERVICE_OPTIONS[0];
    const CurrentIcon = current.icon;

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setOpen(!open)}
                className={`group flex items-center gap-2.5 w-full h-11 rounded-lg border-2 px-3 text-left transition-all ${
                    open ? `${current.bg} border-current ${current.text}` : `bg-white border-slate-300 hover:border-slate-400 ${current.text}`
                }`}>
                <div className={`h-7 w-7 rounded-md ${current.bg} flex items-center justify-center shrink-0 ${current.text}`}>
                    <CurrentIcon className="h-4 w-4" />
                </div>
                <span className="flex-1 text-base font-semibold text-slate-800 truncate">{current.label}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden py-1">
                    {SERVICE_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        const isSelected = opt.value === value;
                        return (
                            <button key={opt.value} type="button"
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${isSelected ? opt.bg : "hover:bg-slate-50"}`}>
                                <div className={`h-8 w-8 rounded-md ${opt.bg} flex items-center justify-center shrink-0 ${opt.text}`}>
                                    <Icon className="h-4 w-4" />
                                </div>
                                <span className={`flex-1 text-sm font-semibold ${isSelected ? opt.text : "text-slate-700"}`}>
                                    {opt.label}
                                </span>
                                {isSelected && <Check className={`h-4 w-4 ${opt.text}`} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
