"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Loader2, CheckCircle, Search, User, Phone, Heart, AlertTriangle } from "lucide-react";
import { updatePatient } from "@/lib/actions/patients";
import { createClient } from "@/lib/supabase/client";
import { HorizontalForm, Section, FieldRow, FORM_INPUT_CLS, FORM_SELECT_CLS } from "@/components/ui/horizontal-form";

const PREFIXES = ["นาย", "นาง", "นางสาว", "เด็กชาย", "เด็กหญิง", "Mr.", "Mrs.", "Ms."];
const BLOOD_GROUPS = ["A", "B", "AB", "O", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const NHSO_RIGHTS = [
    { value: "self_pay", label: "จ่ายเอง (Self Pay)" },
    { value: "uc", label: "บัตรทอง (UC)" },
    { value: "sso", label: "ประกันสังคม (SSO)" },
    { value: "gov_officer", label: "ข้าราชการ" },
    { value: "private_ins", label: "ประกันเอกชน" },
    { value: "none", label: "ไม่ระบุ" },
];
const MARITAL = [
    { value: "single", label: "โสด" },
    { value: "married", label: "สมรส" },
    { value: "divorced", label: "หย่า" },
    { value: "widowed", label: "หม้าย" },
];

interface AddressItem {
    subdistrict_code: string;
    subdistrict_name: string;
    district_name: string;
    province_name: string;
    postal_code: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function EditPatientForm({ patient }: { patient: any }) {
    const router = useRouter();
    const supabase = createClient();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        prefix: patient.prefix || "",
        first_name: patient.first_name || "",
        last_name: patient.last_name || "",
        dob: patient.dob || "",
        gender: patient.gender || "",
        phone: patient.phone || "",
        email: patient.email || "",
        blood_group: patient.blood_group || "",
        nhso_rights: patient.nhso_rights || "self_pay",
        marital_status: patient.marital_status || "",
        occupation: patient.occupation || "",
        race: patient.race || "",
        nationality: patient.nationality || "",
        address_detail: patient.address_detail || "",
        subdistrict_code: patient.subdistrict_code || "",
        allergy_summary: patient.allergy_summary || "",
        emergency_contact_name: patient.emergency_contact_name || "",
        emergency_contact_phone: patient.emergency_contact_phone || "",
        emergency_contact_relation: patient.emergency_contact_relation || "",
    });

    const [tambonQuery, setTambonQuery] = useState("");
    const [tambonResults, setTambonResults] = useState<AddressItem[]>([]);
    const [showTambonList, setShowTambonList] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState<AddressItem | null>(null);
    const tambonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!patient.subdistrict_code) return;
        (async () => {
            const { data } = await supabase
                .from("address_ref")
                .select("subdistrict_code, subdistrict_name, district_name, province_name, postal_code")
                .eq("subdistrict_code", patient.subdistrict_code)
                .maybeSingle();
            if (data) {
                setSelectedAddress(data as AddressItem);
                setTambonQuery(data.subdistrict_name);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patient.subdistrict_code]);

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
            if (data && data.length > 0) { setTambonResults(data as AddressItem[]); setShowTambonList(true); }
            else { setTambonResults([]); setShowTambonList(false); }
        }, 300);
    }, [supabase]);

    function selectTambon(addr: AddressItem) {
        setSelectedAddress(addr);
        setTambonQuery(addr.subdistrict_name);
        setShowTambonList(false);
        setForm(p => ({ ...p, subdistrict_code: addr.subdistrict_code }));
        setSaved(false);
    }

    function clearTambon() {
        setSelectedAddress(null);
        setTambonQuery("");
        setForm(p => ({ ...p, subdistrict_code: "" }));
        setSaved(false);
    }

    function set(key: string) {
        return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
            setForm(p => ({ ...p, [key]: e.target.value }));
            setSaved(false);
        };
    }

    async function handleSave() {
        setSaving(true);
        setError("");
        try {
            await updatePatient(patient.hn, form);
            setSaved(true);
            router.refresh();
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyErr = err as any;
            const msg = anyErr?.message || anyErr?.details || anyErr?.hint
                || (typeof err === "string" ? err : "เกิดข้อผิดพลาด — กรุณาลองอีกครั้ง");
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-4 pb-20">
            {error && (
                <div className="p-3 bg-red-50 border-2 border-red-200 text-red-700 text-[15px] rounded-xl flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            <HorizontalForm>
                {/* ── ข้อมูลส่วนตัว ── */}
                <Section title="ข้อมูลส่วนตัว" icon={User} color="teal">
                    <FieldRow label="คำนำหน้า">
                        <select value={form.prefix} onChange={set("prefix")} className={FORM_SELECT_CLS}>
                            <option value="">— เลือก —</option>
                            {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </FieldRow>
                    <FieldRow label="เพศ">
                        <select value={form.gender} onChange={set("gender")} className={FORM_SELECT_CLS}>
                            <option value="">— เลือก —</option>
                            <option value="M">ชาย</option>
                            <option value="F">หญิง</option>
                            <option value="other">อื่นๆ</option>
                        </select>
                    </FieldRow>

                    <FieldRow label="ชื่อ" required>
                        <Input value={form.first_name} onChange={set("first_name")} className={FORM_INPUT_CLS} />
                    </FieldRow>
                    <FieldRow label="นามสกุล" required>
                        <Input value={form.last_name} onChange={set("last_name")} className={FORM_INPUT_CLS} />
                    </FieldRow>

                    <FieldRow label="วันเกิด">
                        <Input type="date" value={form.dob} onChange={set("dob")} className={FORM_INPUT_CLS} />
                    </FieldRow>
                    <FieldRow label="หมู่เลือด">
                        <select value={form.blood_group} onChange={set("blood_group")} className={FORM_SELECT_CLS}>
                            <option value="">— ไม่ระบุ —</option>
                            {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </FieldRow>

                    <FieldRow label="สถานภาพ">
                        <select value={form.marital_status} onChange={set("marital_status")} className={FORM_SELECT_CLS}>
                            <option value="">— ไม่ระบุ —</option>
                            {MARITAL.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </FieldRow>
                    <FieldRow label="อาชีพ">
                        <Input value={form.occupation} onChange={set("occupation")} placeholder="เช่น ครู, พยาบาล" className={FORM_INPUT_CLS} />
                    </FieldRow>

                    <FieldRow label="เชื้อชาติ">
                        <Input value={form.race} onChange={set("race")} placeholder="ไทย" className={FORM_INPUT_CLS} />
                    </FieldRow>
                    <FieldRow label="สัญชาติ">
                        <Input value={form.nationality} onChange={set("nationality")} placeholder="ไทย" className={FORM_INPUT_CLS} />
                    </FieldRow>
                </Section>

                {/* ── ข้อมูลติดต่อ ── */}
                <Section title="ข้อมูลติดต่อและที่อยู่" icon={Phone} color="amber">
                    <FieldRow label="โทรศัพท์">
                        <Input value={form.phone} onChange={set("phone")} placeholder="0xx-xxx-xxxx" className={FORM_INPUT_CLS} />
                    </FieldRow>
                    <FieldRow label="อีเมล">
                        <Input type="email" value={form.email} onChange={set("email")} placeholder="email@example.com" className={FORM_INPUT_CLS} />
                    </FieldRow>

                    <FieldRow label="ที่อยู่" colSpan={2} align="start">
                        <textarea
                            value={form.address_detail}
                            onChange={set("address_detail")}
                            className="w-full text-[16px] rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[80px] resize-none"
                            placeholder="เช่น 99/9 ซ.1 ถ.สุขุมวิท..."
                        />
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

                    <FieldRow label="รหัส ปณ." colSpan={2}>
                        <div className="flex gap-2 max-w-[280px]">
                            <Input value={selectedAddress?.postal_code || ""} disabled className={`${FORM_INPUT_CLS} bg-slate-50 font-mono flex-1`} />
                            {selectedAddress && (
                                <Button type="button" variant="outline" size="sm" onClick={clearTambon}
                                    className="rounded-lg shrink-0 h-11 px-3 text-[14px]">ล้าง</Button>
                            )}
                        </div>
                    </FieldRow>
                </Section>

                {/* ── ข้อมูลการแพทย์ ── */}
                <Section title="ข้อมูลการแพทย์" icon={Heart} color="rose">
                    <FieldRow label="สิทธิ์การรักษา">
                        <select value={form.nhso_rights} onChange={set("nhso_rights")} className={FORM_SELECT_CLS}>
                            {NHSO_RIGHTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </FieldRow>
                    <FieldRow label="สรุปการแพ้ยา">
                        <Input value={form.allergy_summary} onChange={set("allergy_summary")} placeholder="เช่น แพ้ Penicillin" className={FORM_INPUT_CLS} />
                    </FieldRow>
                </Section>

                {/* ── ผู้ติดต่อฉุกเฉิน ── */}
                <Section title="ผู้ติดต่อฉุกเฉิน" icon={Phone} color="emerald">
                    <FieldRow label="ชื่อ" colSpan={2}>
                        <Input value={form.emergency_contact_name} onChange={set("emergency_contact_name")} className={FORM_INPUT_CLS} />
                    </FieldRow>
                    <FieldRow label="ความสัมพันธ์">
                        <Input value={form.emergency_contact_relation} onChange={set("emergency_contact_relation")} placeholder="เช่น บิดา, มารดา" className={FORM_INPUT_CLS} />
                    </FieldRow>
                    <FieldRow label="เบอร์โทร">
                        <Input value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} placeholder="0xx-xxxxxxx" className={FORM_INPUT_CLS} />
                    </FieldRow>
                </Section>
            </HorizontalForm>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-2">
                {patient.updated_at && (
                    <p className="text-[13px] text-slate-400">
                        แก้ไขล่าสุด: {new Date(patient.updated_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                        {patient.updater?.full_name && ` โดย ${patient.updater.full_name}`}
                    </p>
                )}
                <div className="ml-auto">
                    <Button
                        onClick={handleSave}
                        disabled={saving || saved}
                        className={`gap-2 rounded-xl shadow-md h-12 px-8 text-[16px] font-bold min-w-[180px] ${saved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"} text-white`}
                    >
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> :
                            saved ? <CheckCircle className="h-5 w-5" /> :
                                <Save className="h-5 w-5" />}
                        {saved ? "บันทึกแล้ว!" : saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
