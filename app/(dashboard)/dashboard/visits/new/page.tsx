"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "@/lib/toast";
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
import styles from "../[vn]/visit-workspace.module.css";
import { MED_CERT_TYPES } from "@/lib/med-cert-types";

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
    { value: "aesthetic", label: "ความงาม / หัตถการ", icon: Sparkles, text: "text-blue-700", bg: "bg-blue-50" },
    { value: "wound_care", label: "ทำแผล / ล้างแผล", icon: Bandage, text: "text-blue-700", bg: "bg-blue-50" },
    { value: "med_cert", label: "ขอใบรับรองแพทย์", icon: FileText, text: "text-blue-700", bg: "bg-blue-50" },
    { value: "checkup", label: "ตรวจสุขภาพ", icon: HeartPulse, text: "text-blue-700", bg: "bg-blue-50" },
    { value: "std_test", label: "ตรวจเลือด STD", icon: TestTube, text: "text-blue-700", bg: "bg-blue-50" },
];

function historySummary(value: string | null): string {
    const text = (value || "").trim();
    return /^[-–—\s]*$/.test(text) ? "" : text;
}

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
    const [medCertType, setMedCertType] = useState("treatment");
    const [briefNote, setBriefNote] = useState("");
    // ที่มาของเคส (บังคับ)
    const [caseSource, setCaseSource] = useState<CaseSource | "">("");
    const [caseAffiliateId, setCaseAffiliateId] = useState("");
    const [caseReferralCode, setCaseReferralCode] = useState("");
    const [affiliates, setAffiliates] = useState<Affiliate[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");


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
        if (!selectedPatient) { toast.error("กรุณาเลือกผู้ป่วยก่อน"); return; }
        if (!caseSource) { toast.error("กรุณาเลือก “ที่มาของเคส” ก่อนบันทึก"); return; }
        if (caseSource === "affiliate" && !caseAffiliateId) { toast.error("เลือกเซลล์ฟรีแลนซ์ก่อน"); return; }
        if (caseSource === "referral" && !caseReferralCode.trim()) { toast.error("กรอกรหัสลูกค้าแนะนำก่อน"); return; }
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
                setError(res.error || "ไม่สามารถสร้าง Visit ได้ กรุณาลองอีกครั้ง");
                toast.error(res.error || "เกิดข้อผิดพลาด — ไม่ทราบสาเหตุ");
                return;
            }

            toast.success(`สร้าง Visit สำเร็จ! VN: ${res.vn} — ส่งเข้าคิวซักประวัติแล้ว`);
            setTimeout(() => router.push("/dashboard/screening"), 1200);
        } catch (e) {
            console.error("[visits/new] submit exception:", e);
            toast.error(e instanceof Error ? e.message : "Network error — ลองใหม่อีกครั้ง");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className={`${styles.workspace} space-y-5 animate-fade-in max-w-4xl mx-auto p-3 sm:p-6 pb-8`}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/dashboard/screening">
                    <Button aria-label="กลับหน้าคิวซักประวัติ" variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-xl font-semibold text-slate-800">สร้าง Visit ใหม่</h1>
                    <p className="text-xs text-slate-500">เลือกผู้ป่วยและบริการ เพื่อส่งเข้าคิวซักประวัติ</p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {/* Step 1: Patient */}
            <div className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl shadow-sm p-4 sm:p-5 space-y-3 relative z-50">
                <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg bg-blue-600 text-white text-sm font-semibold flex items-center justify-center shadow-sm">1</span>
                    <Label className="text-sm font-semibold text-slate-800">เลือกผู้ป่วย</Label>
                </div>

                {!selectedPatient ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                                aria-label="ค้นหาผู้ป่วยด้วย HN ชื่อ หรือเบอร์โทร"
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
                                            <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                                                {p.first_name?.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-800 break-words">
                                                    {p.prefix} {p.first_name} {p.last_name}
                                                </div>
                                                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5 mt-0.5">
                                                    <span className="font-mono">{p.hn}</span>
                                                    {p.phone && <><span>·</span><span>{p.phone}</span></>}
                                                    <span>·</span><span>{calcAge(p.dob)} ปี</span>
                                                </div>
                                            </div>
                                            {historySummary(p.allergy_summary) && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
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
                    <div className="rounded-xl bg-slate-50/80 border border-slate-200 overflow-hidden">
                        {/* Top: Identity */}
                        <div className="flex items-center gap-3 p-3">
                            <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-semibold text-lg shadow-md shadow-blue-500/20 shrink-0">
                                {selectedPatient.first_name?.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-semibold text-slate-800">
                                        {selectedPatient.prefix} {selectedPatient.first_name} {selectedPatient.last_name}
                                    </span>
                                    <span className="font-mono text-sm font-semibold text-blue-700">{selectedPatient.hn}</span>
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
                            <button aria-label="เปลี่ยนผู้ป่วย" onClick={() => setSelectedPatient(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Bottom: Warnings (allergy + chronic + emergency) */}
                        {(() => {
                            const activeAllergies = (selectedPatient.patient_allergies || []).filter(a => a.is_active);
                            const chronicList = selectedPatient.patient_chronic_diseases || [];
                            const allergyText = [
                                historySummary(selectedPatient.allergy_summary),
                                ...activeAllergies.map(a => a.allergen_name),
                            ].filter(Boolean).join(", ");
                            const chronicText = [
                                historySummary(selectedPatient.disease_summary),
                                ...chronicList.map(d => d.disease_name),
                            ].filter(Boolean).join(", ");


                            return (
                            <div className="bg-white border-t border-blue-200 p-3 space-y-1.5">
                                {!allergyText && <p className="text-sm text-slate-600">แพ้ยา: ยังไม่ระบุ</p>}
                                {allergyText && (
                                    <div className="flex items-start gap-2 text-sm">
                                        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-semibold text-red-700">แพ้: </span>
                                            <span className="text-red-800 font-semibold">{allergyText}</span>
                                        </div>
                                    </div>
                                )}
                                {!chronicText && <p className="text-sm text-slate-600">โรคประจำตัว: ยังไม่ระบุ</p>}
                                {chronicText && (
                                    <div className="flex items-start gap-2 text-sm">
                                        <Heart className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-semibold text-amber-700">โรคประจำตัว: </span>
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
                                                <span className="text-slate-500"> ({selectedPatient.emergency_contact_relation})</span>
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
            <div className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl shadow-sm p-4 sm:p-5 space-y-3 relative z-40">
                <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg bg-blue-600 text-white text-sm font-semibold flex items-center justify-center shadow-sm">2</span>
                    <Label className="text-sm font-semibold text-slate-800">ประเภทบริการ</Label>
                </div>
                <ServiceCategoryPicker value={serviceCategory} onChange={setServiceCategory} />

                {serviceCategory === "med_cert" && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5">
                        <Label className="text-xs font-semibold text-emerald-800">ประเภทใบรับรองแพทย์</Label>
                        <select aria-label="ประเภทใบรับรองแพทย์" value={medCertType} onChange={e => setMedCertType(e.target.value)}
                            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                            {MED_CERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <p className="text-xs text-slate-500">แพทย์จะตรวจสอบและรับรองเอกสารในขั้นตอนการตรวจ</p>
                    </div>
                )}

                {/* ที่มาของเคส (บังคับ) */}
                <div className="pt-3 border-t border-slate-100">
                    <Label className="text-sm font-semibold text-slate-800">ที่มาของเคส <span className="text-rose-500">*</span></Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        {([["walk_in", "Walk-in"], ["line", "จองผ่าน LINE"], ["affiliate", "เซลล์ฟรีแลนซ์"], ["referral", "ลูกค้าแนะนำ"]] as const).map(([k, l]) => (
                            <button key={k} type="button" aria-pressed={caseSource === k} onClick={() => setCaseSource(k)}
                                className={`h-10 rounded-xl text-xs font-semibold transition-all ${caseSource === k ? "bg-[#2B54F0] text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                                {l}
                            </button>
                        ))}
                    </div>
                    {caseSource === "affiliate" && (
                        <select aria-label="เซลล์ฟรีแลนซ์" value={caseAffiliateId} onChange={e => setCaseAffiliateId(e.target.value)}
                            className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30">
                            <option value="">— เลือกเซลล์ —</option>
                            {affiliates.map(a => <option key={a.id} value={a.id}>{a.name} ({a.referral_code})</option>)}
                        </select>
                    )}
                    {caseSource === "referral" && (
                        <input aria-label="รหัสลูกค้าแนะนำ" value={caseReferralCode} onChange={e => setCaseReferralCode(e.target.value.toUpperCase())}
                            placeholder="รหัสลูกค้าแนะนำ (RFxxxxx)" className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm mt-2 font-mono focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" />
                    )}
                    {!caseSource && <p className="text-xs text-slate-600 mt-1.5">ต้องเลือกที่มาของเคสก่อนเปิด visit</p>}
                </div>
            </div>

            {/* Step 3: Brief Note (optional) */}
            <div className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl shadow-sm p-4 sm:p-5 space-y-2 relative z-10">
                <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg bg-blue-600 text-white text-sm font-semibold flex items-center justify-center shadow-sm">3</span>
                    <Label className="text-sm font-semibold text-slate-800">หมายเหตุเบื้องต้น <span className="text-xs font-normal text-slate-500">(ถ้ามี)</span></Label>
                </div>
                <textarea aria-label="หมายเหตุเบื้องต้น" value={briefNote} onChange={e => setBriefNote(e.target.value)}
                    placeholder="เช่น คนไข้นัด, โทรมาเล่าอาการ, ขอใบรับรองอย่างเดียว..."
                    rows={2}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none" />
                <p className="text-xs text-slate-500">
                    พยาบาลจะซักประวัติเต็มในขั้นตอนต่อไป
                </p>
            </div>

            {/* Submit */}
            <div className="relative z-20">
                <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-white shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="text-sm text-slate-600 min-w-0 leading-relaxed break-words">
                        {selectedPatient ? (
                            <>
                                <strong className="text-slate-800">{selectedPatient.first_name} {selectedPatient.last_name}</strong>{" "}
                                <span className="text-blue-700 font-mono">({selectedPatient.hn})</span>{" "}
                                · <strong>{SERVICE_LABEL[serviceCategory]}</strong>
                            </>
                        ) : (
                            <span className="text-slate-500 italic">เลือกผู้ป่วยก่อน</span>
                        )}
                    </div>
                    <Button size="lg" disabled={!selectedPatient || !caseSource || submitting} onClick={handleSubmit}
                        className="rounded-xl gap-1.5 h-11 bg-blue-700 hover:bg-blue-800 shadow-md shadow-blue-500/25 min-w-[140px] shrink-0 self-end text-white">
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
            <button type="button" aria-expanded={open} aria-label="เลือกประเภทบริการ" onClick={() => setOpen(!open)}
                className={`group flex items-center gap-2.5 w-full min-h-12 rounded-xl border px-3 py-2 text-left transition-all ${
                    open ? `${current.bg} border-current ${current.text}` : `bg-white border-slate-300 hover:border-slate-400 ${current.text}`
                }`}>
                <div className={`h-7 w-7 rounded-md ${current.bg} flex items-center justify-center shrink-0 ${current.text}`}>
                    <CurrentIcon className="h-4 w-4" />
                </div>
                <span className="flex-1 min-w-0 text-base font-semibold text-slate-800 whitespace-normal">{current.label}</span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
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
