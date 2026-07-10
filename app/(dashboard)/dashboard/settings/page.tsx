"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n";
import { SectionBanner } from "@/components/ui/section-banner";
import {
    Settings, User, Building2, Phone, Mail, Save, Loader2, CheckCircle,
    Palette, LogOut, Globe, IdCard, KeyRound, Copy, MapPin, ShieldCheck, Crown,
} from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของคลินิก", admin: "แอดมิน",
    doctor: "แพทย์", dentist: "ทันตแพทย์", nurse: "พยาบาล",
    pharmacist: "เภสัชกร", physio: "นักกายภาพบำบัด",
    receptionist: "เจ้าหน้าที่ต้อนรับ", accountant: "เจ้าหน้าที่บัญชี",
};

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const { t, language, setLanguage } = useLanguage();

    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [codeCopied, setCodeCopied] = useState(false);

    // Profile
    const [fullName, setFullName] = useState("");
    const [fullNameEn, setFullNameEn] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("");

    // Clinic
    const [clinicName, setClinicName] = useState("");
    const [clinicNameEn, setClinicNameEn] = useState("");
    const [clinicCompany, setClinicCompany] = useState("");
    const [clinicCode, setClinicCode] = useState("");
    const [clinicTaxId, setClinicTaxId] = useState("");
    const [clinicLicense, setClinicLicense] = useState("");
    const [clinicPhone, setClinicPhone] = useState("");
    const [clinicAddress, setClinicAddress] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [primaryColor, setPrimaryColor] = useState("#1d4ed8");
    const [clinicId, setClinicId] = useState<string | null>(null);

    const isAdmin = role === "owner" || role === "admin";

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setEmail(user.email || "");

            const { data: profile } = await supabase
                .from("profiles")
                .select("full_name, full_name_en, phone, role, clinic_id")
                .eq("id", user.id).single();

            if (profile) {
                setFullName(profile.full_name || "");
                setFullNameEn(profile.full_name_en || "");
                setPhone(profile.phone || "");
                setRole(profile.role || "");
                setClinicId(profile.clinic_id);

                if (profile.clinic_id) {
                    const { data: tenant } = await supabase
                        .from("tenants")
                        .select("clinic_name, clinic_name_en, company_name, clinic_code, tax_id, license_number, phone, address_detail, logo_url, primary_color")
                        .eq("id", profile.clinic_id).single();
                    if (tenant) {
                        setClinicName(tenant.clinic_name || "");
                        setClinicNameEn(tenant.clinic_name_en || "");
                        setClinicCompany(tenant.company_name || "");
                        setClinicCode(tenant.clinic_code || "");
                        setClinicTaxId(tenant.tax_id || "");
                        setClinicLicense(tenant.license_number || "");
                        setClinicPhone(tenant.phone || "");
                        setClinicAddress(tenant.address_detail || "");
                        setLogoUrl(tenant.logo_url || "");
                        setPrimaryColor(tenant.primary_color || "#1d4ed8");
                    }
                }
            }
        })();
    }, [supabase]);

    async function handleSaveProfile() {
        setLoading(true);
        setError("");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            const { error: updateErr } = await supabase.from("profiles").update({
                full_name: fullName || null,
                full_name_en: fullNameEn || null,
                phone: phone || null,
            }).eq("id", user.id);
            if (updateErr) throw updateErr;

            if (clinicId && isAdmin) {
                const { error: clinicErr } = await supabase.from("tenants").update({
                    clinic_name: clinicName || null,
                    clinic_name_en: clinicNameEn || null,
                    company_name: clinicCompany || null,
                    tax_id: clinicTaxId || null,
                    license_number: clinicLicense || null,
                    phone: clinicPhone || null,
                    address_detail: clinicAddress || null,
                    logo_url: logoUrl || null,
                    primary_color: primaryColor || null,
                }).eq("id", clinicId);
                if (clinicErr) throw clinicErr;
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error saving profile");
        } finally {
            setLoading(false);
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.push("/login");
    }

    function copyCode() {
        if (!clinicCode) return;
        navigator.clipboard.writeText(clinicCode);
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
    }

    const inputClass = "rounded-xl h-11 bg-white border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all";

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-24 relative z-10">
            {/* Sub-header — compact */}
            <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-sm font-medium text-slate-500">
                    <span className="font-bold text-blue-700">ตั้งค่าระบบและโปรไฟล์ส่วนตัว</span>
                </p>
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs h-9 text-red-600 border-red-200 hover:bg-red-50" onClick={handleLogout}>
                    <LogOut className="h-3.5 w-3.5" /> {t("logout")}
                </Button>
            </div>

            {error && <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700 font-medium">{error}</div>}
            {saved && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4 text-sm text-emerald-800 font-medium flex items-center gap-2"><CheckCircle className="h-5 w-5" />บันทึกข้อมูลเรียบร้อย</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* ─── LEFT: Account + Language ─── */}
                <div className="space-y-5">
                    {/* Account status */}
                    <div className="gonix-card-premium overflow-hidden">
                        <SectionBanner icon={ShieldCheck} title="สถานะบัญชี" description="Account Status" />
                        <div className="p-5 space-y-3">
                            <InfoRow icon={Mail} label="อีเมล" value={email} mono />
                            <InfoRow icon={Crown} label="ตำแหน่ง" value={ROLE_LABEL[role] || role || "—"} />
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                                    <span className="text-xs text-slate-500">สถานะ</span>
                                </div>
                                <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> ใช้งาน
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {/* Clinic Code (owner/admin only) */}
                    {isAdmin && clinicCode && (
                        <div className="gonix-card-premium overflow-hidden">
                            <SectionBanner icon={KeyRound} title="รหัสคลินิก" description="สำหรับให้พนักงานสมัคร" />
                            <div className="p-5 space-y-3">
                                <div className="rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4 text-center ring-1 ring-white/10 shadow-md">
                                    <div className="text-[10px] font-bold text-cyan-200/70 uppercase tracking-[0.2em] mb-1">CLINIC CODE</div>
                                    <div className="text-3xl font-black text-white tracking-[0.15em] font-mono">{clinicCode}</div>
                                </div>
                                <Button onClick={copyCode} variant="outline" className="w-full rounded-xl gap-2">
                                    {codeCopied ? <><CheckCircle className="h-4 w-4 text-emerald-600" /> คัดลอกแล้ว</> : <><Copy className="h-4 w-4" /> คัดลอกรหัส</>}
                                </Button>
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    📌 ส่งรหัสนี้ให้พนักงานใหม่กรอกตอน signup เพื่อเข้าเป็นพนักงานคลินิก
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Language */}
                    <div className="gonix-card-premium overflow-hidden">
                        <SectionBanner icon={Globe} title="ภาษา" description="Language" />
                        <div className="p-5">
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setLanguage("th")}
                                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all ${language === "th" ? "bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-500/20" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
                                >
                                    <span className="text-2xl mb-1">🇹🇭</span>
                                    <span className="text-sm font-bold">ภาษาไทย</span>
                                </button>
                                <button
                                    onClick={() => setLanguage("en")}
                                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all ${language === "en" ? "bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-500/20" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
                                >
                                    <span className="text-2xl mb-1">🇬🇧</span>
                                    <span className="text-sm font-bold">English</span>
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-3 text-center">ปรับใช้ทันทีทั่วระบบ</p>
                        </div>
                    </div>
                </div>

                {/* ─── RIGHT: Forms ─── */}
                <div className="lg:col-span-2 space-y-5">
                    {/* Personal */}
                    <div className="gonix-card-premium overflow-hidden">
                        <SectionBanner icon={User} title="ข้อมูลส่วนตัว" description="Personal Information" />
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">ชื่อ-นามสกุล (ไทย)</Label>
                                    <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="ชื่อ นามสกุล" className={inputClass} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">English Name</Label>
                                    <Input value={fullNameEn} onChange={e => setFullNameEn(e.target.value)} placeholder="First Last" className={inputClass} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs flex items-center gap-1.5"><Mail className="h-3 w-3" /> อีเมล</Label>
                                    <Input value={email} disabled className="rounded-xl h-11 bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs flex items-center gap-1.5"><Phone className="h-3 w-3" /> เบอร์โทรศัพท์</Label>
                                    <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="081-xxx-xxxx" className={inputClass} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Clinic (owner/admin only) */}
                    {clinicId && isAdmin && (
                        <div className="gonix-card-premium overflow-hidden">
                            <SectionBanner icon={Building2} title="ข้อมูลคลินิก" description="Clinic Setup" />
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">ชื่อคลินิก (ไทย)</Label>
                                        <Input value={clinicName} onChange={e => setClinicName(e.target.value)} className={inputClass} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Clinic Name (EN)</Label>
                                        <Input value={clinicNameEn} onChange={e => setClinicNameEn(e.target.value)} className={inputClass} />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs flex items-center gap-1.5"><Building2 className="h-3 w-3" /> ชื่อบริษัท/นิติบุคคล (หัวกระดาษบรรทัด 2)</Label>
                                        <Input value={clinicCompany} onChange={e => setClinicCompany(e.target.value)} placeholder="เช่น บริษัท ธนเวช เมดิคอล จำกัด (สำนักงานใหญ่)" className={inputClass} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs flex items-center gap-1.5"><IdCard className="h-3 w-3" /> เลขผู้เสียภาษี (Tax ID)</Label>
                                        <Input value={clinicTaxId} onChange={e => setClinicTaxId(e.target.value)} placeholder="13 หลัก" className={`${inputClass} font-mono`} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">เลขที่ใบอนุญาต (Medical License)</Label>
                                        <Input value={clinicLicense} onChange={e => setClinicLicense(e.target.value)} placeholder="License No." className={`${inputClass} font-mono`} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs flex items-center gap-1.5"><Phone className="h-3 w-3" /> เบอร์โทรคลินิก</Label>
                                        <Input value={clinicPhone} onChange={e => setClinicPhone(e.target.value)} className={inputClass} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Logo URL</Label>
                                        <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className={inputClass} />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs flex items-center gap-1.5"><MapPin className="h-3 w-3" /> ที่อยู่</Label>
                                    <Input value={clinicAddress} onChange={e => setClinicAddress(e.target.value)} placeholder="ที่อยู่เต็ม" className={inputClass} />
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-200/60">
                                    <Label className="text-xs flex items-center gap-1.5"><Palette className="h-3 w-3" /> สีหลักของแบรนด์</Label>
                                    <div className="flex items-center gap-3 bg-slate-50/60 p-3 rounded-xl border border-slate-200">
                                        <div className="relative overflow-hidden rounded-xl border border-slate-200 h-12 w-16 flex-shrink-0">
                                            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="absolute -top-4 -left-4 w-32 h-32 cursor-pointer" />
                                        </div>
                                        <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#1d4ed8" className={`${inputClass} font-mono uppercase`} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isAdmin && (
                        <div className="rounded-2xl bg-blue-50/60 border border-blue-200 p-4 flex items-start gap-3">
                            <ShieldCheck className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-900">
                                <p className="font-bold mb-1">ข้อมูลคลินิก</p>
                                <p className="text-xs text-blue-800/80">
                                    เฉพาะเจ้าของคลินิก/แอดมินเท่านั้นที่แก้ไขข้อมูลคลินิกได้ — ติดต่อแอดมินถ้าต้องการเปลี่ยนแปลง
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky save bar */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50 flex justify-end gap-3 pl-72 pr-8">
                <Button
                    onClick={handleSaveProfile}
                    disabled={loading}
                    size="lg"
                    className="rounded-2xl gap-2 px-8 text-base font-bold shadow-lg shadow-slate-900/25 hover:shadow-xl bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 ring-1 ring-white/10 text-white h-12"
                >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : saved ? <CheckCircle className="h-5 w-5" /> : <Save className="h-5 w-5" />}
                    {saved ? "บันทึกแล้ว" : t("save")}
                </Button>
            </div>
        </div>
    );
}

function InfoRow({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
                <Icon className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">{label}</span>
            </div>
            <span className={`text-sm text-slate-800 font-semibold truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
        </div>
    );
}
