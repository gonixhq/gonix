"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { bangkokDate } from "@/lib/utils/date";
import { pickSiamIdFolder, readCardFromFolder, mapPrefix } from "@/lib/thai-id-card";
import {
    ArrowLeft, Save, Loader2, CheckCircle, AlertTriangle,
    User, Phone, Heart, Camera, MapPin, Undo2, Search, X, ShieldCheck, CreditCard, UserCheck
} from "lucide-react";
import { HorizontalForm, Section, FieldRow, SubHeader, FORM_INPUT_CLS, FORM_SELECT_CLS } from "@/components/ui/horizontal-form";
import { PDPAModal } from "@/components/ui/pdpa-modal";
import PreRegisterPicker, { type PendingFull } from "./pre-register-picker";
import { markPendingAsUsed, countPendingRegistrations } from "@/lib/actions/pending-registrations";
import { lookupAffiliateByCode } from "@/lib/actions/affiliates";

/* ─── Age Calculator (precise: year, month, day) ─── */
function calcAge(dobStr: string) {
    if (!dobStr) return { y: 0, m: 0, d: 0 };
    const birth = new Date(dobStr + "T00:00:00");
    const now = new Date();
    let y = now.getFullYear() - birth.getFullYear();
    let m = now.getMonth() - birth.getMonth();
    let d = now.getDate() - birth.getDate();
    if (d < 0) {
        m--;
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        d += prevMonth.getDate();
    }
    if (m < 0) { y--; m += 12; }
    return { y: Math.max(0, y), m: Math.max(0, m), d: Math.max(0, d) };
}

interface AddressItem {
    subdistrict_code: string;
    subdistrict_name: string;
    district_name: string;
    province_name: string;
    postal_code: string;
}

export default function NewPatientPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [idType, setIdType] = useState<"thai" | "passport">("thai");
    const [dob, setDob] = useState("");
    const [registrarName, setRegistrarName] = useState("...");
    const [registrarId, setRegistrarId] = useState<string | null>(null);
    const [clinicName, setClinicName] = useState("คลินิก");
    const [showPDPA, setShowPDPA] = useState(false);
    const [previewHN, setPreviewHN] = useState<string | null>(null);
    const [clinicIdMissing, setClinicIdMissing] = useState(false);

    const [tambonQuery, setTambonQuery] = useState("");
    const [tambonResults, setTambonResults] = useState<AddressItem[]>([]);
    const [showTambonList, setShowTambonList] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState<AddressItem | null>(null);
    const tambonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [readingCard, setReadingCard] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cardHandleRef = useRef<any>(null);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [pulledData, setPulledData] = useState<PendingFull | null>(null);
    const [pulledId, setPulledId] = useState<string | null>(null);
    const [formKey, setFormKey] = useState(0);
    const [pendingCount, setPendingCount] = useState(0);

    function handlePickPreReg(data: PendingFull) {
        setPulledData(data);
        setPulledId(data.id);
        setDob(data.dob || "");
        setIdType(data.thai_id_card ? "thai" : data.passport_no ? "passport" : "thai");
        if (data.subdistrict_code) {
            (async () => {
                const { data: addr } = await supabase
                    .from("address_ref")
                    .select("subdistrict_code, subdistrict_name, district_name, province_name, postal_code")
                    .eq("subdistrict_code", data.subdistrict_code)
                    .maybeSingle();
                if (addr) {
                    setSelectedAddress(addr);
                    setTambonQuery(addr.subdistrict_name);
                }
            })();
        }
        setFormKey(k => k + 1);
    }

    function handleClearPulled() {
        setPulledData(null);
        setPulledId(null);
        setDob("");
        setSelectedAddress(null);
        setTambonQuery("");
        setFormKey(k => k + 1);
    }

    async function handleReadCard() {
        setError("");
        setReadingCard(true);
        try {
            if (!cardHandleRef.current) {
                cardHandleRef.current = await pickSiamIdFolder();  // เลือกโฟลเดอร์ SIAM-ID ครั้งแรก
            }
            const { card, photo } = await readCardFromFolder(cardHandleRef.current);
            setIdType("thai");
            if (card.birthDate) setDob(card.birthDate);
            // แนบรูปจากบัตรอัตโนมัติ
            if (photo) {
                setPhotoFile(photo);
                const reader = new FileReader();
                reader.onload = () => setPhotoPreview(reader.result as string);
                reader.readAsDataURL(photo);
            }
            // ฟอร์มเป็น uncontrolled → เติมค่าผ่าน DOM (รอ field render ก่อน)
            setTimeout(() => {
                const form = document.querySelector("form") as HTMLFormElement | null;
                if (!form) return;
                const set = (name: string, val: string) => {
                    const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
                    if (el && val) el.value = val;
                };
                set("thai_id_card", card.citizenId);
                set("prefix", mapPrefix(card.prefixTh));
                set("first_name", card.firstNameTh);
                set("last_name", card.lastNameTh);
                set("first_name_en", card.firstNameEn);
                set("last_name_en", card.lastNameEn);
                set("gender", card.gender);
                set("address_detail", card.addressDetail || card.address);
                set("address_moo", card.moo);
            }, 50);

            // auto-เลือกตำบลจากบัตร → เติม อำเภอ/จังหวัด/รหัสไปรษณีย์
            if (card.tambon) {
                const { data } = await supabase
                    .from("address_ref")
                    .select("subdistrict_code, subdistrict_name, district_name, province_name, postal_code")
                    .ilike("subdistrict_name", `%${card.tambon}%`)
                    .limit(30);
                const ms = data || [];
                const norm = (s: string) => (s || "").replace(/\s/g, "");
                const best =
                    ms.find((a) => norm(a.subdistrict_name) === norm(card.tambon)
                        && (!card.amphoe || norm(a.district_name).includes(norm(card.amphoe)))
                        && (!card.province || norm(a.province_name).includes(norm(card.province))))
                    || ms.find((a) => (!card.amphoe || norm(a.district_name).includes(norm(card.amphoe)))
                        && (!card.province || norm(a.province_name).includes(norm(card.province))))
                    || ms[0];
                if (best) selectTambon(best);
            }
        } catch (e) {
            // ผู้ใช้กดยกเลิกหน้าต่างเลือกไฟล์ → ไม่ต้องแจ้ง error
            if ((e as { name?: string })?.name === "AbortError") { setReadingCard(false); return; }
            setError(e instanceof Error ? e.message : "อ่านบัตรไม่สำเร็จ");
        } finally {
            setReadingCard(false);
        }
    }

    const age = calcAge(dob);

    useEffect(() => {
        (async () => {
            const r = await countPendingRegistrations();
            if (r.success) setPendingCount(r.count);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setRegistrarId(user.id);
                const { data: profile, error: profileErr } = await supabase
                    .from("profiles").select("full_name, role, clinic_id").eq("id", user.id).single();

                if (profileErr || !profile) {
                    setClinicIdMissing(true);
                    return;
                }

                const roleLabel: Record<string, string> = {
                    owner: "เจ้าของคลินิก", doctor: "แพทย์", nurse: "พยาบาล",
                    pharmacist: "เภสัชกร", staff: "เจ้าหน้าที่", admin: "ผู้ดูแลระบบ",
                };
                setRegistrarName(`${profile.full_name} (${roleLabel[profile.role] || profile.role})`);

                if (!profile.clinic_id) {
                    setClinicIdMissing(true);
                    return;
                }

                const { data: tenant } = await supabase.from("tenants").select("clinic_name").eq("id", profile.clinic_id).single();
                if (tenant?.clinic_name) setClinicName(tenant.clinic_name);

                const { data: rn } = await supabase
                    .from("running_numbers")
                    .select("prefix, last_number")
                    .eq("clinic_id", profile.clinic_id)
                    .eq("number_type", "HN")
                    .single();
                if (rn) {
                    const nextNum = (rn.last_number || 0) + 1;
                    const beYear = ((new Date().getFullYear() + 543) % 100).toString().padStart(2, "0");
                    setPreviewHN(`HN${beYear}${nextNum.toString().padStart(4, "0")}`);
                } else {
                    setPreviewHN("จะสร้างอัตโนมัติ");
                }
            }
        })();
    }, [supabase]);

    const searchTambon = useCallback((q: string) => {
        setTambonQuery(q);
        if (q.length < 2) { setTambonResults([]); setShowTambonList(false); return; }

        if (tambonTimer.current) clearTimeout(tambonTimer.current);
        tambonTimer.current = setTimeout(async () => {
            const isPostal = /^\d+$/.test(q);
            const { data } = await supabase
                .from("address_ref")
                .select("subdistrict_code, subdistrict_name, district_name, province_name, postal_code")
                .ilike(isPostal ? "postal_code" : "subdistrict_name", `%${q}%`)
                .limit(15);

            if (data && data.length > 0) { setTambonResults(data); setShowTambonList(true); }
            else { setTambonResults([]); setShowTambonList(false); }
        }, 300);
    }, [supabase]);

    function selectTambon(addr: AddressItem) {
        setSelectedAddress(addr);
        setTambonQuery(addr.subdistrict_name);
        setShowTambonList(false);
    }

    function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onload = () => setPhotoPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess("");

        const form = new FormData(e.currentTarget);
        const firstName = form.get("first_name") as string;
        const lastName = form.get("last_name") as string;

        if (!firstName || !lastName) { setError("กรุณากรอกชื่อและนามสกุล"); setLoading(false); return; }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
            if (!profile) throw new Error("Profile not found");

            const { data: hn, error: hnError } = await supabase.rpc("fn_next_number", { p_clinic_id: profile.clinic_id, p_type: "HN" });
            if (hnError) throw hnError;

            let photoUrl: string | null = null;
            if (photoFile) {
                const ext = photoFile.name.split(".").pop();
                const filePath = `patients/${hn}/photo.${ext}`;
                const { error: uploadError } = await supabase.storage.from("clinic-assets").upload(filePath, photoFile, { upsert: true });
                if (!uploadError) {
                    const { data: urlData } = supabase.storage.from("clinic-assets").getPublicUrl(filePath);
                    photoUrl = urlData.publicUrl;
                }
            }

            const getField = (name: string) => (form.get(name) as string) || null;

            const patient = {
                hn,
                clinic_id: profile.clinic_id,
                prefix: getField("prefix"),
                first_name: firstName,
                last_name: lastName,
                first_name_en: getField("first_name_en"),
                last_name_en: getField("last_name_en"),
                dob: getField("dob"),
                gender: getField("gender"),
                phone: getField("phone"),
                email: getField("email"),
                thai_id_card: idType === "thai" ? getField("thai_id_card") : null,
                passport_no: idType === "passport" ? getField("passport_no") : null,
                blood_group: getField("blood_group"),
                race: getField("race"),
                nationality: getField("nationality"),
                marital_status: getField("marital_status"),
                allergy_summary: getField("allergy_summary"),
                disease_summary: getField("disease_summary"),
                past_history: getField("past_history"),
                nhso_rights: getField("nhso_rights") || "self_pay",
                nhso_main_hospital: getField("nhso_main_hospital"),
                line_user_id: getField("line_user_id"),
                address_detail: getField("address_detail"),
                address_moo: getField("address_moo"),
                subdistrict_code: selectedAddress?.subdistrict_code || getField("subdistrict_code"),
                occupation: getField("occupation"),
                emergency_contact_name: getField("emergency_contact_name"),
                emergency_contact_phone: getField("emergency_contact_phone"),
                emergency_contact_relation: getField("emergency_contact_relation"),
                photo_url: photoUrl,
                pdpa_consent: form.get("pdpa_consent") === "on",
                review_consent: form.get("review_consent") === "on",
                registered_by: registrarId,
                first_visit_date: bangkokDate(),
            };

            // ผูก affiliate จากรหัสแนะนำ (ถ้ามี)
            const refCode = (getField("affiliate_code") || "").trim().toUpperCase();
            if (refCode) {
                const aff = await lookupAffiliateByCode(refCode);
                if (aff) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (patient as any).affiliate_id = aff.id;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (patient as any).affiliate_attributed_at = bangkokDate();
                }
            }

            const { error: insertError } = await supabase.from("patients").insert(patient);
            if (insertError) throw insertError;

            if (pulledId && hn) {
                await markPendingAsUsed(pulledId, hn);
            }

            setSuccess(`ลงทะเบียนสำเร็จ! HN: ${hn}`);
            setTimeout(() => router.push(`/dashboard/patients/${hn}`), 1500);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setError(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-4 animate-fade-in pb-24 max-w-6xl mx-auto">
            <PDPAModal open={showPDPA} onClose={() => setShowPDPA(false)} clinicName={clinicName} />
            <PreRegisterPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePickPreReg} />

            {clinicIdMissing && (
                <div className="rounded-2xl bg-orange-50 border border-orange-200 px-5 py-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-orange-800">บัญชีนี้ยังไม่ได้เชื่อมกับคลินิก</p>
                        <p className="text-sm text-orange-700 mt-1">กรุณา Run ไฟล์ <code className="font-mono bg-orange-100 px-1 rounded">007_fix_missing_clinic_id.sql</code></p>
                    </div>
                </div>
            )}

            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/patients">
                        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 h-9 text-slate-600 hover:text-slate-800">
                            <ArrowLeft className="h-4 w-4" /> กลับ
                        </Button>
                    </Link>
                    <span className="text-slate-300">·</span>
                    <span className="text-[15px] font-medium text-slate-500">กรอกข้อมูลผู้ป่วยใหม่ — HN สร้างอัตโนมัติ</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm"
                        className="rounded-xl text-xs gap-1.5 h-9 border-blue-300 text-blue-700 hover:bg-blue-50 relative"
                        onClick={() => setPickerOpen(true)}
                    >
                        <UserCheck className="h-3.5 w-3.5" /> ดึงข้อมูลล่วงหน้า
                        {pendingCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                                {pendingCount}
                            </span>
                        )}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs gap-1.5 h-9" onClick={() => {
                        const formEl = document.querySelector("form") as HTMLFormElement;
                        formEl?.reset(); setDob(""); setPhotoPreview(null); setPhotoFile(null);
                        setSelectedAddress(null); setTambonQuery("");
                    }}>
                        <Undo2 className="h-3.5 w-3.5" /> ล้างค่า
                    </Button>
                </div>
            </div>

            {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-[15px]">{error}</div>}
            {success && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 flex items-center gap-2 text-[15px]"><CheckCircle className="h-4 w-4" /> {success}</div>}

            {pulledData && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3">
                    <UserCheck className="h-5 w-5 text-blue-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold text-blue-900">ดึงข้อมูลจากลงทะเบียนล่วงหน้าแล้ว</div>
                        <div className="text-xs text-blue-700 mt-0.5">
                            {pulledData.first_name} {pulledData.last_name} · {pulledData.phone}
                            {pulledData.source === "line_oa" && " · จาก LINE OA"}
                            {pulledData.source === "online_form" && " · จาก Online Form"}
                        </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleClearPulled}
                        className="rounded-lg gap-1.5 text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-100">
                        <X className="h-3 w-3" /> ล้างข้อมูล
                    </Button>
                </div>
            )}

            <form onSubmit={handleSubmit} key={formKey}>
                {/* ── ID Card Preview (รูปถ่าย + HN + วันที่ลงทะเบียน) ── */}
                <div className="rounded-2xl border border-[#2B54F0]/15 bg-gradient-to-br from-[#2B54F0]/5 via-white to-[#00A6C0]/5 shadow-sm p-4 mb-4 flex items-center gap-5">
                    <label className="cursor-pointer shrink-0">
                        {photoPreview ? (
                            <img
                                src={photoPreview}
                                alt="Patient"
                                className="h-24 w-24 rounded-2xl object-cover border-2 border-[#2B54F0]/25 shadow-md hover:opacity-90 transition-opacity"
                            />
                        ) : (
                            <div className="h-24 w-24 rounded-2xl border-2 border-dashed border-[#2B54F0]/30 bg-white flex flex-col items-center justify-center hover:bg-[#2B54F0]/5 transition-colors">
                                <Camera className="h-7 w-7 text-[#2B54F0]/60" />
                                <span className="text-[10px] text-[#2B54F0] mt-0.5 font-medium">เพิ่มรูป</span>
                            </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    </label>

                    <div className="flex-1">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2B54F0]/70">Hospital Number</div>
                        <div className="font-mono font-black text-2xl text-[#2B54F0] leading-tight mt-0.5">
                            {previewHN || <Loader2 className="h-5 w-5 animate-spin text-[#2B54F0]/50" />}
                        </div>
                    </div>

                    <div className="text-right shrink-0">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">วันที่ลงทะเบียน</div>
                        <div className="font-bold text-base text-slate-700 mt-0.5">
                            {new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                    </div>
                </div>

                <HorizontalForm>
                    {/* ── ข้อมูลทั่วไป ── */}
                    <Section title="ข้อมูลทั่วไป (Identity)" icon={User} color="teal">
                        <FieldRow label="เพศ" required>
                            <select name="gender" defaultValue={pulledData?.gender || ""} className={FORM_SELECT_CLS}>
                                <option value="">—</option>
                                <option value="M">ชาย</option>
                                <option value="F">หญิง</option>
                                <option value="other">อื่นๆ</option>
                            </select>
                        </FieldRow>
                        <FieldRow label="ประเภทบัตร">
                            <div className="flex rounded-lg overflow-hidden border border-slate-300 h-11">
                                <button type="button" onClick={() => setIdType("thai")}
                                    className={`flex-1 px-3 text-[15px] font-medium transition-all ${idType === "thai" ? "bg-blue-600 text-white" : "bg-white hover:bg-slate-50"}`}>
                                    บัตรประชาชน
                                </button>
                                <button type="button" onClick={() => setIdType("passport")}
                                    className={`flex-1 px-3 text-[15px] font-medium transition-all ${idType === "passport" ? "bg-blue-600 text-white" : "bg-white hover:bg-slate-50"}`}>
                                    Passport
                                </button>
                            </div>
                        </FieldRow>

                        {idType === "thai" ? (
                            <FieldRow label="เลขบัตร ปชช." required colSpan={2}>
                                <div className="flex gap-2">
                                    <Input name="thai_id_card" defaultValue={pulledData?.thai_id_card || ""} maxLength={13} placeholder="XXXXXXXXXXXXX" className={`${FORM_INPUT_CLS} flex-1`} />
                                    <Button type="button" variant="outline" disabled={readingCard}
                                        className="rounded-lg gap-1.5 h-11 shrink-0 border-[#2B54F0]/40 text-[#2B54F0] hover:bg-[#2B54F0]/5 disabled:opacity-60"
                                        onClick={handleReadCard}
                                    >
                                        {readingCard ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                        {readingCard ? "กำลังอ่าน..." : "อ่านบัตร"}
                                    </Button>
                                </div>
                            </FieldRow>
                        ) : (
                            <FieldRow label="Passport No." colSpan={2}>
                                <Input name="passport_no" defaultValue={pulledData?.passport_no || ""} placeholder="Passport No." className={FORM_INPUT_CLS} />
                            </FieldRow>
                        )}

                        <FieldRow label="คำนำหน้า">
                            <select name="prefix" defaultValue={pulledData?.prefix || ""} className={FORM_SELECT_CLS}>
                                <option value="">—</option>
                                <option value="นาย">นาย</option>
                                <option value="นาง">นาง</option>
                                <option value="น.ส.">น.ส.</option>
                                <option value="ด.ช.">ด.ช.</option>
                                <option value="ด.ญ.">ด.ญ.</option>
                            </select>
                        </FieldRow>
                        <FieldRow label="วันเกิด" required>
                            <Input name="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={FORM_INPUT_CLS} />
                        </FieldRow>

                        <FieldRow label="ชื่อ" required>
                            <Input name="first_name" defaultValue={pulledData?.first_name || ""} required className={FORM_INPUT_CLS} />
                        </FieldRow>
                        <FieldRow label="นามสกุล" required>
                            <Input name="last_name" defaultValue={pulledData?.last_name || ""} required className={FORM_INPUT_CLS} />
                        </FieldRow>

                        <FieldRow label="ชื่อ (EN)">
                            <Input name="first_name_en" defaultValue={pulledData?.first_name_en || ""} placeholder="First name" className={FORM_INPUT_CLS} />
                        </FieldRow>
                        <FieldRow label="นามสกุล (EN)">
                            <Input name="last_name_en" defaultValue={pulledData?.last_name_en || ""} placeholder="Last name" className={FORM_INPUT_CLS} />
                        </FieldRow>

                        <FieldRow label="อายุ" colSpan={2}>
                            <div className="grid grid-cols-3 gap-2 max-w-md">
                                <div className="flex items-center gap-1.5">
                                    <Input value={dob ? age.y : ""} disabled className={`${FORM_INPUT_CLS} bg-slate-50 text-center`} />
                                    <span className="text-[15px] text-slate-500 shrink-0">ปี</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Input value={dob ? age.m : ""} disabled className={`${FORM_INPUT_CLS} bg-slate-50 text-center`} />
                                    <span className="text-[15px] text-slate-500 shrink-0">ด.</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Input value={dob ? age.d : ""} disabled className={`${FORM_INPUT_CLS} bg-slate-50 text-center`} />
                                    <span className="text-[15px] text-slate-500 shrink-0">ว.</span>
                                </div>
                            </div>
                        </FieldRow>

                        <FieldRow label="หมู่เลือด">
                            <select name="blood_group" defaultValue={pulledData?.blood_group || ""} className={FORM_SELECT_CLS}>
                                <option value="">—</option>
                                <option value="A">A</option><option value="B">B</option>
                                <option value="AB">AB</option><option value="O">O</option>
                            </select>
                        </FieldRow>
                        <FieldRow label="สถานะสมรส">
                            <select name="marital_status" defaultValue={pulledData?.marital_status || ""} className={FORM_SELECT_CLS}>
                                <option value="">—</option>
                                <option value="โสด">โสด</option>
                                <option value="สมรส">สมรส</option>
                                <option value="หย่า">หย่า</option>
                                <option value="หม้าย">หม้าย</option>
                            </select>
                        </FieldRow>

                        <FieldRow label="อาชีพ">
                            <Input name="occupation" defaultValue={pulledData?.occupation || ""} className={FORM_INPUT_CLS} />
                        </FieldRow>
                        <FieldRow label="สิทธิ์การรักษา">
                            <select name="nhso_rights" defaultValue={pulledData?.nhso_rights || "self_pay"} className={FORM_SELECT_CLS}>
                                <option value="self_pay">ชำระเงินเอง</option>
                                <option value="uc">UC (บัตรทอง)</option>
                                <option value="sso">ประกันสังคม</option>
                                <option value="gov_officer">ข้าราชการ</option>
                                <option value="private_ins">ประกันเอกชน</option>
                            </select>
                        </FieldRow>

                        <FieldRow label="เชื้อชาติ">
                            <Input name="race" defaultValue={pulledData?.race || "ไทย"} className={FORM_INPUT_CLS} />
                        </FieldRow>
                        <FieldRow label="สัญชาติ">
                            <Input name="nationality" defaultValue={pulledData?.nationality || "ไทย"} className={FORM_INPUT_CLS} />
                        </FieldRow>
                    </Section>

                    {/* ── ที่อยู่ & ติดต่อ ── */}
                    <Section title="ที่อยู่ และการติดต่อ" icon={MapPin} color="amber">
                        <FieldRow label="เบอร์โทรศัพท์" required>
                            <Input name="phone" type="tel" defaultValue={pulledData?.phone || ""} placeholder="08X-XXX-XXXX" className={FORM_INPUT_CLS} />
                        </FieldRow>
                        <FieldRow label="Line ID">
                            <Input name="line_user_id" defaultValue={pulledData?.line_user_id || ""} placeholder="@line_id" className={FORM_INPUT_CLS} />
                        </FieldRow>

                        <FieldRow label="อีเมล" colSpan={2}>
                            <Input name="email" type="email" defaultValue={pulledData?.email || ""} placeholder="email@example.com" className={`${FORM_INPUT_CLS} max-w-md`} />
                        </FieldRow>

                        <FieldRow label="บ้านเลขที่/ซอย/ถนน" colSpan={2}>
                            <Input name="address_detail" defaultValue={pulledData?.address_detail || ""} placeholder="เช่น 99/9 ซ.1 ถ.สุขุมวิท" className={FORM_INPUT_CLS} />
                        </FieldRow>

                        <FieldRow label="หมู่ที่">
                            <Input name="address_moo" defaultValue={pulledData?.address_moo || ""} placeholder="ระบุหมู่" className={FORM_INPUT_CLS} />
                        </FieldRow>

                        <FieldRow label="ค้นหาตำบล" colSpan={2} align="start" hint="พิมพ์ชื่อตำบล หรือรหัสไปรษณีย์">
                            <div className="relative">
                                <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                                <Input
                                    value={tambonQuery}
                                    onChange={(e) => searchTambon(e.target.value)}
                                    onFocus={() => tambonResults.length > 0 && setShowTambonList(true)}
                                    placeholder="พิมพ์ชื่อตำบล..."
                                    className={`${FORM_INPUT_CLS} pl-9`}
                                />
                                <input type="hidden" name="subdistrict_code" value={selectedAddress?.subdistrict_code || ""} />
                                {showTambonList && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                                        {tambonResults.map((addr) => (
                                            <button key={addr.subdistrict_code} type="button" onClick={() => selectTambon(addr)}
                                                className="w-full text-left px-3 py-2.5 text-[14px] hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0">
                                                <span className="font-medium">{addr.subdistrict_name}</span>
                                                <span className="text-slate-500"> → {addr.district_name}, {addr.province_name} {addr.postal_code}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </FieldRow>

                        <FieldRow label="อำเภอ">
                            <Input value={selectedAddress?.district_name || ""} disabled className={`${FORM_INPUT_CLS} bg-slate-50`} />
                        </FieldRow>
                        <FieldRow label="จังหวัด">
                            <Input value={selectedAddress?.province_name || ""} disabled className={`${FORM_INPUT_CLS} bg-slate-50`} />
                        </FieldRow>
                        <FieldRow label="รหัส ปณ.">
                            <Input value={selectedAddress?.postal_code || ""} disabled className={`${FORM_INPUT_CLS} bg-slate-50 font-mono`} />
                        </FieldRow>
                    </Section>

                    {/* ── ผู้ติดต่อฉุกเฉิน ── */}
                    <Section title="ผู้ติดต่อฉุกเฉิน" icon={Phone} color="emerald">
                        <FieldRow label="ชื่อผู้ติดต่อ" colSpan={2}>
                            <Input name="emergency_contact_name" defaultValue={pulledData?.emergency_contact_name || ""} placeholder="ชื่อ-สกุล" className={FORM_INPUT_CLS} />
                        </FieldRow>
                        <FieldRow label="ความสัมพันธ์">
                            <Input name="emergency_contact_relation" defaultValue={pulledData?.emergency_contact_relation || ""} placeholder="เช่น บิดา / มารดา" className={FORM_INPUT_CLS} />
                        </FieldRow>
                        <FieldRow label="เบอร์โทร">
                            <Input name="emergency_contact_phone" type="tel" defaultValue={pulledData?.emergency_contact_phone || ""} placeholder="08x-xxxxxxx" className={FORM_INPUT_CLS} />
                        </FieldRow>
                    </Section>

                    {/* ── ข้อมูลทางการแพทย์ ── */}
                    <Section title="ข้อมูลทางการแพทย์" icon={Heart} color="rose">
                        <FieldRow label="ประวัติแพ้ยา" colSpan={2} align="start">
                            <textarea
                                name="allergy_summary"
                                defaultValue={pulledData?.allergy_summary || ""}
                                rows={2}
                                className="w-full text-[16px] rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="ระบุชื่อยาที่แพ้ (ถ้ามี)"
                            />
                        </FieldRow>
                        <FieldRow label="โรคประจำตัว" colSpan={2} align="start">
                            <textarea
                                name="disease_summary"
                                defaultValue={pulledData?.disease_summary || ""}
                                rows={2}
                                className="w-full text-[16px] rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="ระบุโรคประจำตัว"
                            />
                        </FieldRow>
                        <FieldRow label="ประวัติเจ็บป่วยในอดีต (PH)" colSpan={2} align="start">
                            <textarea
                                name="past_history"
                                rows={2}
                                className="w-full text-[16px] rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="โรค/ผ่าตัด/การรักษาที่ผ่านมา (ถ้ามี)"
                            />
                        </FieldRow>
                        <FieldRow label="รหัสแนะนำ (เซลล์/Affiliate)">
                            <Input name="affiliate_code" placeholder="ถ้ามีเซลล์แนะนำมา ใส่รหัส" className={`${FORM_INPUT_CLS} font-mono uppercase`} />
                        </FieldRow>
                    </Section>

                    {/* ── PDPA + Registrar ── */}
                    <Section title="ความยินยอม (PDPA)" icon={ShieldCheck} color="sky">
                        <div className="col-span-full space-y-3 px-2">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input type="checkbox" name="pdpa_consent" defaultChecked={pulledData?.pdpa_consent === true} className="h-5 w-5 mt-0.5 rounded accent-blue-600" />
                                <span className="text-[15px] leading-relaxed">
                                    ข้าพเจ้าได้อ่านและยอมรับ{" "}
                                    <button type="button" onClick={() => setShowPDPA(true)} className="text-blue-600 font-semibold underline hover:text-blue-700">
                                        นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
                                    </button>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input type="checkbox" name="review_consent" defaultChecked={pulledData?.review_consent === true} className="h-5 w-5 mt-0.5 rounded accent-blue-600" />
                                <span className="text-[15px] leading-relaxed">ยินยอมให้รีวิวหรือเผยแพร่ผลการรักษา</span>
                            </label>
                            <div className="pt-3 border-t border-slate-200">
                                <p className="text-[14px] text-slate-600">
                                    ผู้บันทึกข้อมูล: <span className="font-semibold text-slate-800">{registrarName}</span>
                                </p>
                            </div>
                        </div>
                    </Section>
                </HorizontalForm>

                {/* Sticky Submit Bar */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t-2 border-slate-200 flex justify-end gap-3 z-50 px-6 sm:pl-72 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.15)]">
                    <Link href="/dashboard/patients">
                        <Button variant="outline" type="button" className="rounded-xl px-7 h-12 text-[16px] font-bold border-2">ยกเลิก</Button>
                    </Link>
                    <Button type="submit" disabled={loading} className="rounded-xl px-9 h-12 text-[16px] font-bold bg-gradient-to-r from-[#2B54F0] to-[#00A6C0] hover:opacity-90 shadow-lg shadow-[#2B54F0]/25 text-white gap-2">
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        {loading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
