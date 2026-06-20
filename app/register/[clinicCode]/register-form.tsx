"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Loader2, MessageCircle, ShieldCheck, AlertTriangle, Search, X } from "lucide-react";
import { PDPAModal } from "@/components/ui/pdpa-modal";

interface AddressItem {
    subdistrict_code: string;
    subdistrict_name: string;
    district_name: string;
    province_name: string;
    postal_code: string;
}

interface Clinic {
    id: string;
    clinic_name: string;
    clinic_name_en: string | null;
    phone: string | null;
    address_detail: string | null;
}

export default function RegisterForm({ clinic }: { clinic: Clinic }) {
    const supabase = createClient();
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");
    const [showPDPA, setShowPDPA] = useState(false);

    /* ── Subdistrict autocomplete ── */
    const [tambonQuery, setTambonQuery] = useState("");
    const [tambonResults, setTambonResults] = useState<AddressItem[]>([]);
    const [showTambonList, setShowTambonList] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState<AddressItem | null>(null);
    const tambonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    function clearTambon() {
        setSelectedAddress(null);
        setTambonQuery("");
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const form = new FormData(e.currentTarget);
        const getField = (n: string) => (form.get(n) as string)?.trim() || null;

        const firstName = getField("first_name");
        const lastName = getField("last_name");
        const phone = getField("phone");

        if (!firstName || !lastName || !phone) {
            setError("กรุณากรอกชื่อ-นามสกุล และเบอร์โทร");
            setSubmitting(false);
            return;
        }

        const payload = {
            clinic_id: clinic.id,
            source: "online_form",
            prefix: getField("prefix"),
            first_name: firstName,
            last_name: lastName,
            dob: getField("dob"),
            gender: getField("gender"),
            thai_id_card: getField("thai_id_card"),
            phone,
            email: getField("email"),
            line_user_id: getField("line_user_id"),
            blood_group: getField("blood_group"),
            marital_status: getField("marital_status"),
            occupation: getField("occupation"),
            race: getField("race"),
            nationality: getField("nationality"),
            address_detail: getField("address_detail"),
            address_moo: getField("address_moo"),
            subdistrict_code: selectedAddress?.subdistrict_code || null,
            allergy_summary: getField("allergy_summary"),
            disease_summary: getField("disease_summary"),
            emergency_contact_name: getField("emergency_contact_name"),
            emergency_contact_phone: getField("emergency_contact_phone"),
            emergency_contact_relation: getField("emergency_contact_relation"),
            pdpa_consent: form.get("pdpa_consent") === "on",
        };

        const { error: insertErr } = await supabase
            .from("pending_registrations")
            .insert(payload);

        if (insertErr) {
            setError(`ส่งข้อมูลไม่สำเร็จ: ${insertErr.message}`);
            setSubmitting(false);
            return;
        }

        setDone(true);
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (done) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center p-5">
                <div className="bg-white rounded-3xl shadow-xl border border-emerald-100 max-w-md w-full p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="h-9 w-9 text-emerald-600" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-slate-800">ลงทะเบียนสำเร็จ!</h1>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                        ขอบคุณที่ลงทะเบียนล่วงหน้า<br />
                        กรุณามายืนยันตัวตนที่เคาน์เตอร์เมื่อมาถึงคลินิก
                    </p>
                    <div className="mt-5 pt-5 border-t border-slate-100">
                        <p className="text-xs text-slate-500">{clinic.clinic_name}</p>
                        {clinic.phone && <p className="text-xs text-slate-500 mt-1">📞 {clinic.phone}</p>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-sky-50 py-5 sm:py-8 px-3 sm:px-4">
            <PDPAModal open={showPDPA} onClose={() => setShowPDPA(false)} clinicName={clinic.clinic_name} />
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-5 sm:mb-6 px-2">
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
                        ลงทะเบียนล่วงหน้า
                    </h1>
                    <p className="text-sm text-slate-600 mt-1">
                        เพื่อความรวดเร็วในวันรับบริการที่ <strong>{clinic.clinic_name}</strong>
                    </p>
                    {clinic.address_detail && (
                        <p className="text-xs text-slate-500 mt-1">{clinic.address_detail}</p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-2xl sm:rounded-3xl shadow-md border border-slate-200/70 p-4 sm:p-6 space-y-4 sm:space-y-5">
                    {error && (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                        </div>
                    )}

                    {/* Name */}
                    <SectionTitle>ข้อมูลส่วนตัว</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="คำนำหน้า" name="prefix" type="select" options={[
                            { value: "นาย", label: "นาย" },
                            { value: "นาง", label: "นาง" },
                            { value: "น.ส.", label: "น.ส." },
                            { value: "ด.ช.", label: "ด.ช." },
                            { value: "ด.ญ.", label: "ด.ญ." },
                        ]} />
                        <Field label="เพศ" name="gender" type="select" options={[
                            { value: "M", label: "ชาย" },
                            { value: "F", label: "หญิง" },
                            { value: "other", label: "อื่นๆ" },
                        ]} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="ชื่อ *" name="first_name" required />
                        <Field label="นามสกุล *" name="last_name" required />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="วันเกิด" name="dob" type="date" />
                        <Field label="เลขบัตรประชาชน" name="thai_id_card" placeholder="13 หลัก" maxLength={13} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="กรุ๊ปเลือด" name="blood_group" type="select" options={[
                            { value: "A", label: "A" }, { value: "B", label: "B" },
                            { value: "AB", label: "AB" }, { value: "O", label: "O" },
                        ]} />
                        <Field label="สถานะสมรส" name="marital_status" type="select" options={[
                            { value: "โสด", label: "โสด" },
                            { value: "สมรส", label: "สมรส" },
                            { value: "หย่า", label: "หย่า" },
                            { value: "หม้าย", label: "หม้าย" },
                        ]} />
                    </div>

                    <Field label="อาชีพ" name="occupation" placeholder="เช่น พนักงานบริษัท" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="เชื้อชาติ" name="race" placeholder="ไทย" defaultValue="ไทย" />
                        <Field label="สัญชาติ" name="nationality" placeholder="ไทย" defaultValue="ไทย" />
                    </div>

                    {/* Contact */}
                    <SectionTitle>การติดต่อ</SectionTitle>
                    <div className="grid grid-cols-1 gap-3">
                        <Field label="เบอร์โทรศัพท์ *" name="phone" type="tel" required placeholder="08X-XXX-XXXX" />
                        <Field label="อีเมล" name="email" type="email" placeholder="example@email.com" />
                        <Field label="LINE ID" name="line_user_id" placeholder="@somchai หรือเบอร์โทร LINE" />
                    </div>

                    {/* Address */}
                    <SectionTitle>ที่อยู่</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                            <Field label="บ้านเลขที่ / ซอย / ถนน" name="address_detail" placeholder="เช่น 99/9 ซ.สุขุมวิท 21 ถ.อโศก" />
                        </div>
                        <Field label="หมู่ที่" name="address_moo" placeholder="เช่น 4" />
                    </div>

                    {/* Tambon autocomplete */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="space-y-1.5 relative sm:col-span-2">
                            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                                <Search className="h-3 w-3" /> ค้นหาตำบล / รหัสปณ.
                            </Label>
                            <Input
                                value={tambonQuery}
                                onChange={(e) => searchTambon(e.target.value)}
                                onFocus={() => tambonResults.length > 0 && setShowTambonList(true)}
                                placeholder="พิมพ์ชื่อตำบลหรือรหัสปณ..."
                                className="h-12 rounded-xl border-slate-300 focus:ring-blue-500/30 focus:border-blue-500 text-base sm:text-sm"
                            />
                            {showTambonList && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                                    {tambonResults.map((addr) => (
                                        <button key={addr.subdistrict_code} type="button" onClick={() => selectTambon(addr)}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0">
                                            <span className="font-medium">{addr.subdistrict_name}</span>
                                            <span className="text-slate-500"> → {addr.district_name}, {addr.province_name} {addr.postal_code}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">อำเภอ</Label>
                            <Input value={selectedAddress?.district_name || ""} disabled
                                className="h-11 rounded-xl bg-slate-100 text-slate-600 border-slate-200" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">จังหวัด</Label>
                            <Input value={selectedAddress?.province_name || ""} disabled
                                className="h-11 rounded-xl bg-slate-100 text-slate-600 border-slate-200" />
                        </div>
                    </div>
                    {selectedAddress && (
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                            <span className="text-blue-800">
                                ✓ ที่อยู่: ต.{selectedAddress.subdistrict_name} อ.{selectedAddress.district_name} จ.{selectedAddress.province_name} <strong>{selectedAddress.postal_code}</strong>
                            </span>
                            <button type="button" onClick={clearTambon} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                                <X className="h-3 w-3" /> ล้าง
                            </button>
                        </div>
                    )}

                    {/* Medical */}
                    <SectionTitle>ข้อมูลทางการแพทย์</SectionTitle>
                    <div className="space-y-3">
                        <FieldTextarea label="ประวัติแพ้ยา/อาหาร" name="allergy_summary" placeholder="ระบุยา/อาหารที่แพ้ (ถ้ามี)" />
                        <FieldTextarea label="โรคประจำตัว" name="disease_summary" placeholder="เบาหวาน, ความดัน, ฯลฯ (ถ้ามี)" />
                    </div>

                    {/* Emergency */}
                    <SectionTitle>ผู้ติดต่อฉุกเฉิน</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="ชื่อ" name="emergency_contact_name" placeholder="ชื่อ-นามสกุล" />
                        <Field label="ความสัมพันธ์" name="emergency_contact_relation" placeholder="บิดา, มารดา, ฯลฯ" />
                    </div>
                    <Field label="เบอร์โทร" name="emergency_contact_phone" type="tel" placeholder="08X-XXX-XXXX" />

                    {/* PDPA */}
                    <div className="pt-3 border-t border-slate-200 space-y-2">
                        <button
                            type="button"
                            onClick={() => setShowPDPA(true)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors group"
                        >
                            <span className="text-sm font-bold text-blue-900 inline-flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-blue-600" />
                                อ่านนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ฉบับเต็ม
                            </span>
                            <span className="text-xs text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform">›</span>
                        </button>

                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input type="checkbox" name="pdpa_consent" required
                                className="h-5 w-5 mt-0.5 rounded accent-blue-600" />
                            <span className="text-sm text-slate-700 leading-relaxed">
                                ข้าพเจ้าได้อ่านและยินยอมให้ <strong>{clinic.clinic_name}</strong> เก็บและใช้ข้อมูลส่วนบุคคล
                                และข้อมูลสุขภาพ ตามวัตถุประสงค์ที่ระบุใน{" "}
                                <button type="button" onClick={() => setShowPDPA(true)} className="text-blue-600 font-bold underline hover:text-blue-700">
                                    นโยบาย PDPA
                                </button>
                                {" "}<span className="text-red-500">*</span>
                            </span>
                        </label>
                    </div>

                    {/* Submit */}
                    <Button type="submit" disabled={submitting}
                        className="w-full rounded-xl h-14 text-base font-semibold bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 shadow-md">
                        {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <MessageCircle className="h-5 w-5 mr-2" />}
                        {submitting ? "กำลังส่ง..." : "ส่งข้อมูลลงทะเบียน"}
                    </Button>

                    <p className="text-xs text-center text-slate-400">
                        ข้อมูลจะถูกเก็บอย่างปลอดภัย — เจ้าหน้าที่จะยืนยันตัวตนเมื่อท่านมาถึงคลินิก
                    </p>
                </form>
            </div>
        </div>
    );
}

/* ─── Components ─── */
function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 pt-2">
            <div className="h-1 w-8 bg-blue-600 rounded-full" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{children}</h3>
        </div>
    );
}

function Field({
    label, name, type = "text", placeholder, required, options, maxLength, defaultValue,
}: {
    label: string; name: string; type?: string;
    placeholder?: string; required?: boolean;
    options?: { value: string; label: string }[];
    maxLength?: number;
    defaultValue?: string;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={name} className="text-xs font-semibold text-slate-600">{label}</Label>
            {type === "select" ? (
                <select name={name} id={name} required={required} defaultValue={defaultValue || ""}
                    className="flex h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                    <option value="">—</option>
                    {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            ) : (
                <Input id={name} name={name} type={type} required={required} placeholder={placeholder} maxLength={maxLength} defaultValue={defaultValue}
                    className="h-12 rounded-xl border-slate-300 focus:ring-blue-500/30 focus:border-blue-500 text-base sm:text-sm" />
            )}
        </div>
    );
}

function FieldTextarea({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={name} className="text-xs font-semibold text-slate-600">{label}</Label>
            <textarea id={name} name={name} placeholder={placeholder} rows={3}
                className="flex w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none" />
        </div>
    );
}
