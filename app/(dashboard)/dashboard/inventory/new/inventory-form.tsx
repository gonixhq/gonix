"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { FileText, Tag, CircleDollarSign, Save, Loader2, CheckCircle, X, Sparkles, Sun, Sunrise, Sunset, Moon } from "lucide-react";

// ─── Dropdown options ────────────────────────────────────
const UNIT_OPTIONS = [
    "เม็ด (tab)",
    "แคปซูล (cap)",
    "ขวด (bottle)",
    "หลอด (tube)",
    "ซอง (sachet)",
    "ชิ้น (piece)",
    "แผง (blister)",
    "กระปุก (jar)",
    "แอมป์ (amp)",
    "ไวอัล (vial)",
    "กล่อง (box)",
    "ml",
    "cc",
    "g",
    "mg",
    "ครั้ง (session)",
];

// prefix รหัสสินค้าตามหมวดหมู่
const CODE_PREFIX: Record<string, string> = { drug: "DRG", supply: "SUP", service: "SVC" };

const DOSAGE_FORM_OPTIONS = [
    { value: "Tab", label: "เม็ด (Tablet)" },
    { value: "Cap", label: "แคปซูล (Capsule)" },
    { value: "Syr", label: "น้ำเชื่อม (Syrup)" },
    { value: "Susp", label: "ยาน้ำแขวนตะกอน (Suspension)" },
    { value: "Sol", label: "สารละลาย (Solution)" },
    { value: "Inj", label: "ฉีด (Injection)" },
    { value: "Cream", label: "ครีม (Cream)" },
    { value: "Oint", label: "ขี้ผึ้ง (Ointment)" },
    { value: "Gel", label: "เจล (Gel)" },
    { value: "Lotion", label: "โลชั่น (Lotion)" },
    { value: "Drops", label: "หยอด (Drops)" },
    { value: "Eye Drops", label: "หยอดตา (Eye Drops)" },
    { value: "Ear Drops", label: "หยอดหู (Ear Drops)" },
    { value: "Nasal Spray", label: "พ่นจมูก (Nasal Spray)" },
    { value: "Inhaler", label: "พ่นปาก (Inhaler)" },
    { value: "Lozenge", label: "อม (Lozenge)" },
    { value: "Powder", label: "ผง (Powder)" },
    { value: "Supp", label: "เหน็บ (Suppository)" },
    { value: "Patch", label: "แผ่นแปะ (Patch)" },
    { value: "Spray", label: "สเปรย์ (Spray)" },
    { value: "Kit", label: "ชุดตรวจ (Test Kit)" },
    { value: "Strip", label: "แผ่นตรวจ (Test Strip)" },
    { value: "Set", label: "ชุดอุปกรณ์ (Set)" },
];

const STRENGTH_UNIT_OPTIONS = [
    "mg",
    "g",
    "mcg",
    "ml",
    "mg/ml",
    "mg/g",
    "g/ml",
    "IU",
    "mEq",
    "%",
    "(none)",
];

const LABEL_TYPE_OPTIONS = [
    { value: "ยาทั่วไป", label: "ยาทั่วไป (OTC)" },
    { value: "ยาอันตราย", label: "ยาอันตราย" },
    { value: "ยาปฏิชีวนะ", label: "ยาปฏิชีวนะ (Antibiotics)" },
    { value: "ยาควบคุมพิเศษ", label: "ยาควบคุมพิเศษ" },
    { value: "วัตถุออกฤทธิ์", label: "วัตถุออกฤทธิ์ต่อจิตประสาท" },
    { value: "ยาเสพติด", label: "ยาเสพติดให้โทษ" },
    { value: "ยาแผนโบราณ", label: "ยาแผนโบราณ / สมุนไพร" },
    { value: "ยาบรรจุเสร็จ", label: "ยาสามัญประจำบ้าน" },
    { value: "ยาฉีด", label: "ยาฉีด (Parenteral)" },
    { value: "ยาภายนอก", label: "ยาใช้ภายนอก (External)" },
    { value: "เวชภัณฑ์", label: "เวชภัณฑ์ทางการแพทย์" },
];

// ── Layout helpers (module scope — ห้ามนิยามใน component มิฉะนั้น input จะ remount/เสีย focus ทุกครั้งที่พิมพ์) ──
function FieldRow({ label, required, children, colSpan = 1, hidden }: {
    label: React.ReactNode;
    required?: boolean;
    children: React.ReactNode;
    colSpan?: 1 | 2;
    hidden?: boolean;
}) {
    return (
        <div className={`grid grid-cols-[150px_1fr] items-center gap-3 ${colSpan === 2 ? "md:col-span-2" : ""} ${hidden ? "hidden" : ""}`}>
            <label className={`text-[16px] font-semibold text-right ${required ? "text-red-600" : "text-slate-700"} truncate`}>
                {required && <span className="mr-0.5">*</span>}{label}
            </label>
            <div>{children}</div>
        </div>
    );
}

function SectionTitle({ icon: Icon, title, color }: {
    icon: React.ElementType;
    title: string;
    color: "slate" | "amber" | "emerald";
}) {
    const styles = {
        slate: "from-slate-100 to-slate-50 border-slate-300 text-slate-800",
        amber: "from-amber-100 to-amber-50 border-amber-300 text-amber-900",
        emerald: "from-emerald-100 to-emerald-50 border-emerald-300 text-emerald-900",
    }[color];
    const iconBg = {
        slate: "bg-slate-200 text-slate-700",
        amber: "bg-amber-200 text-amber-800",
        emerald: "bg-emerald-200 text-emerald-800",
    }[color];
    return (
        <div className={`flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r ${styles} border-b rounded-t-2xl`}>
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${iconBg}`}>
                <Icon className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold">{title}</h2>
        </div>
    );
}

function SubHeader({ label }: { label: string }) {
    return (
        <div className="col-span-full text-[13px] font-bold uppercase tracking-wider text-slate-500 pb-2 mb-1 border-b border-slate-200 flex items-center gap-1.5">
            <span className="h-1 w-5 bg-slate-300 rounded-full" />
            {label}
        </div>
    );
}

export default function InventoryForm() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [codePreview, setCodePreview] = useState("Auto");

    // --- Section 1: Basic Info ---
    const [itemName, setItemName] = useState("");
    const [category, setCategory] = useState("drug");
    const [segment, setSegment] = useState("product");
    const [unit, setUnit] = useState("");
    const [genericName, setGenericName] = useState("");
    const [tradeName, setTradeName] = useState("");
    const [strengthValue, setStrengthValue] = useState("");
    const [strengthUnit, setStrengthUnit] = useState("mg");
    const [dosageForm, setDosageForm] = useState("");
    const [dosageCustom, setDosageCustom] = useState(false);

    // Computed strength (e.g. "500mg")
    const strength = strengthValue
        ? `${strengthValue}${strengthUnit === "(none)" ? "" : strengthUnit}`
        : "";

    // --- Section 2: Label Info ---
    const [itemNameTh, setItemNameTh] = useState("");
    const [indication, setIndication] = useState("");
    const [storageInfo, setStorageInfo] = useState("");
    const [doseQty, setDoseQty] = useState("");
    const [frequency, setFrequency] = useState("");
    const [useType, setUseType] = useState("");
    const [labelType, setLabelType] = useState("");
    const [labelCustom, setLabelCustom] = useState(false);
    const [warningLabel, setWarningLabel] = useState("");
    const [sigTextDefault, setSigTextDefault] = useState("");

    // --- Section 3: Price, Stock & Fees ---
    const [sellPrice, setSellPrice] = useState("");
    const [costPrice, setCostPrice] = useState("0");
    const [stockQty, setStockQty] = useState("0");
    const [minStock, setMinStock] = useState("0");
    const [autoCutStock, setAutoCutStock] = useState("true");
    const [expiryDate, setExpiryDate] = useState("");
    const [lotNo, setLotNo] = useState("");
    const [dfDoctor, setDfDoctor] = useState("0");
    const [dfNurse, setDfNurse] = useState("0");
    const [dfAssistant, setDfAssistant] = useState("0");
    const [location, setLocation] = useState("");
    const [supplier, setSupplier] = useState("");
    const [note, setNote] = useState("");

    // สร้างรหัสสินค้าอัตโนมัติ: PREFIX-NNNN ตามหมวดหมู่
    async function genItemCode(clinicId: string): Promise<string> {
        const prefix = CODE_PREFIX[category] || "ITM";
        const { count } = await supabase.from("inventory")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", clinicId).eq("category", category);
        return `${prefix}-${String((count || 0) + 1).padStart(4, "0")}`;
    }

    // preview รหัสในช่อง — อัปเดตเมื่อเปลี่ยนหมวดหมู่
    useEffect(() => {
        let alive = true;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
            if (!profile?.clinic_id || !alive) return;
            const code = await genItemCode(profile.clinic_id);
            if (alive) setCodePreview(code);
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category]);

    async function handleSave() {
        if (!itemName || !unit || !sellPrice) {
            setError("กรุณากรอก ชื่อแสดง (Item Name), หน่วยนับ (Unit) และ ราคาขาย (Price)");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
            if (!profile?.clinic_id) throw new Error("Clinic ID not found");

            const payload = {
                clinic_id: profile.clinic_id,
                item_code: await genItemCode(profile.clinic_id),
                item_name: itemName,
                category,
                segment,
                unit,
                generic_name: genericName || null,
                trade_name: tradeName || null,
                strength: strength || null,
                dosage_form: dosageForm.trim() || null,

                item_name_th: itemNameTh || null,
                indication: indication || null,
                storage_info: storageInfo || null,
                dose_qty: doseQty || null,
                frequency: frequency || null,
                use_type: useType || null,
                label_type: labelType.trim() || null,
                warning_label: warningLabel || null,
                sig_text_default: sigTextDefault || null,

                sell_price: parseFloat(sellPrice) || 0,
                cost_price: parseFloat(costPrice) || 0,
                stock_qty: parseFloat(stockQty) || 0,
                min_stock: parseFloat(minStock) || 0,
                auto_cut_stock: autoCutStock === "true",
                expiry_date: expiryDate || null,
                df_doctor: parseFloat(dfDoctor) || 0,
                df_nurse: parseFloat(dfNurse) || 0,
                df_assistant: parseFloat(dfAssistant) || 0,
                location: location || null,
                supplier: supplier || null,
                note: note || null,
            };

            const { data: created, error: insertErr } = await supabase.from("inventory").insert(payload).select("id").single();
            if (insertErr) throw insertErr;

            // สร้างล็อตเปิด (ถ้ามีสต๊อกตั้งต้น) — เพื่อให้ระบบ lot/FEFO ทำงาน
            const openingQty = parseFloat(stockQty) || 0;
            if (created?.id && openingQty > 0) {
                await supabase.from("inventory_lots").insert({
                    clinic_id: profile.clinic_id,
                    item_id: created.id,
                    lot_no: lotNo.trim() || null,
                    expiry_date: expiryDate || null,
                    qty_received: openingQty,
                    qty_remaining: openingQty,
                    cost_per_unit: parseFloat(costPrice) || 0,
                    note: "ยอดยกมา (ตั้งต้น)",
                });
            }

            setSaved(true);
            setTimeout(() => {
                setSaved(false);
                router.push("/dashboard/inventory");
                router.refresh();
            }, 1500);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
        } finally {
            setLoading(false);
        }
    }

    // CSS class helpers — compact horizontal form (larger text)
    const inputCls = "h-11 text-[16px] rounded-lg border-slate-300 focus-visible:ring-blue-500/20 focus-visible:border-blue-500";
    const selectCls = "w-full h-11 px-3 text-[16px] rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

    return (
        <div className="space-y-5 pb-24 max-w-5xl mx-auto">
            {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl border-2 border-red-200 text-[15px] font-medium flex items-start gap-2">
                    <X className="h-5 w-5 shrink-0 mt-0.5" />
                    {error}
                </div>
            )}

            {/* ═══════════ SECTION 1: ข้อมูลพื้นฐาน ═══════════ */}
            <div className="rounded-2xl border border-slate-200/80 shadow-md shadow-slate-200/40 bg-white overflow-hidden">
                <SectionTitle icon={FileText} title="ข้อมูลพื้นฐาน" color="slate" />
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <FieldRow label="รหัส">
                        <Input value={codePreview} disabled className={`${inputCls} bg-slate-100 text-slate-500 border-dashed font-mono`} />
                    </FieldRow>
                    <FieldRow label="หมวดหมู่">
                        <select className={selectCls} value={category} onChange={e => setCategory(e.target.value)}>
                            <option value="drug">ยา (Drug)</option>
                            <option value="supply">เวชภัณฑ์ (Supply)</option>
                            <option value="service">บริการ (Service)</option>
                        </select>
                    </FieldRow>

                    <FieldRow label="แผนก (รายได้)">
                        <select className={selectCls} value={segment} onChange={e => setSegment(e.target.value)}>
                            <option value="product">ขายของ (Product)</option>
                            <option value="medical">การแพทย์ (Medical)</option>
                            <option value="aesthetic">ความงาม (Aesthetic)</option>
                        </select>
                    </FieldRow>

                    <FieldRow label="ชื่อแสดง" required colSpan={2}>
                        <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="เช่น Paracetamol 500mg" className={inputCls} />
                    </FieldRow>

                    <FieldRow label="ชื่อสามัญ">
                        <Input value={genericName} onChange={e => setGenericName(e.target.value)} placeholder="Paracetamol" className={inputCls} />
                    </FieldRow>
                    <FieldRow label="ชื่อการค้า">
                        <Input value={tradeName} onChange={e => setTradeName(e.target.value)} placeholder="Tylenol" className={inputCls} />
                    </FieldRow>

                    <FieldRow label="หน่วยนับ" required>
                        <Input list="unit-options" value={unit} onChange={e => setUnit(e.target.value)} placeholder="พิมพ์ หรือเลือก ▼" className={inputCls} />
                        <datalist id="unit-options">
                            {UNIT_OPTIONS.map(u => <option key={u} value={u} />)}
                        </datalist>
                    </FieldRow>
                    <FieldRow label="รูปแบบ">
                        <select
                            value={dosageCustom ? "__custom__" : (DOSAGE_FORM_OPTIONS.some(o => o.value === dosageForm) ? dosageForm : "")}
                            onChange={e => {
                                if (e.target.value === "__custom__") { setDosageCustom(true); setDosageForm(""); return; }
                                setDosageCustom(false); setDosageForm(e.target.value);
                            }}
                            className={selectCls}
                        >
                            <option value="">— เลือก —</option>
                            {DOSAGE_FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                        </select>
                    </FieldRow>

                    <FieldRow label="พิมพ์รูปแบบ" colSpan={2} hidden={!dosageCustom}>
                        <Input value={dosageForm} onChange={e => setDosageForm(e.target.value)} placeholder="พิมพ์รูปแบบเอง" className={inputCls} />
                    </FieldRow>

                    <FieldRow label="ความแรง" colSpan={2}>
                        <div className="grid grid-cols-[1fr_140px] gap-2">
                            <Input value={strengthValue} onChange={e => setStrengthValue(e.target.value)} placeholder="500" className={`${inputCls} font-mono`} />
                            <select value={strengthUnit} onChange={e => setStrengthUnit(e.target.value)} className={selectCls}>
                                {STRENGTH_UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        {strength && (
                            <p className="text-[12px] text-slate-500 mt-1">
                                บันทึก: <span className="font-mono font-bold text-blue-700">{strength}</span>
                            </p>
                        )}
                    </FieldRow>
                </div>
            </div>

            {/* ═══════════ SECTION 2: ข้อมูลฉลากยา ═══════════ */}
            <div className="rounded-2xl border-2 border-amber-200 shadow-sm bg-white overflow-hidden">
                <SectionTitle icon={Tag} title="ข้อมูลฉลากยา" color="amber" />
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <SubHeader label="ข้อมูลทั่วไป" />
                    <FieldRow label="ชื่อภาษาไทย">
                        <Input value={itemNameTh} onChange={e => setItemNameTh(e.target.value)} placeholder="พาราเซตามอล" className={inputCls} />
                    </FieldRow>
                    <FieldRow label="สรรพคุณ">
                        <Input value={indication} onChange={e => setIndication(e.target.value)} placeholder="ยาบรรเทาปวด ลดไข้" className={inputCls} />
                    </FieldRow>
                    <FieldRow label="การเก็บรักษา" colSpan={2}>
                        <Input value={storageInfo} onChange={e => setStorageInfo(e.target.value)} placeholder="เก็บพ้นแสงแดด ที่อุณหภูมิห้อง" className={inputCls} />
                    </FieldRow>

                    <SubHeader label="วิธีใช้ยา (SIG)" />
                    <FieldRow label="ขนาด/ครั้ง">
                        <Input value={doseQty} onChange={e => setDoseQty(e.target.value)} placeholder="1-2 เม็ด" className={inputCls} />
                    </FieldRow>
                    <FieldRow label="วิธีรับประทาน">
                        <Input
                            list="use-type-options"
                            value={useType}
                            onChange={e => setUseType(e.target.value)}
                            placeholder="ก่อน/หลังอาหาร..."
                            className={inputCls}
                        />
                        <datalist id="use-type-options">
                            <option value="ก่อนอาหาร" />
                            <option value="หลังอาหาร" />
                            <option value="พร้อมอาหาร" />
                            <option value="ก่อนนอน" />
                            <option value="ขณะท้องว่าง" />
                            <option value="เมื่อมีอาการ (PRN)" />
                        </datalist>
                    </FieldRow>

                    <FieldRow label="ความถี่" colSpan={2}>
                        <FrequencyPicker value={frequency} onChange={setFrequency} />
                    </FieldRow>

                    <FieldRow label="วิธีใช้ Default" colSpan={2}>
                        <Input
                            value={sigTextDefault}
                            onChange={e => setSigTextDefault(e.target.value)}
                            placeholder="เช่น รับประทานครั้งละ 1 เม็ด เช้า-เย็น หลังอาหาร"
                            className={`${inputCls} border-cyan-300 bg-cyan-50/30`}
                        />
                        {(doseQty || frequency || useType) && !sigTextDefault && (
                            <button
                                type="button"
                                onClick={() => setSigTextDefault(`รับประทานครั้งละ ${doseQty || "—"} ${frequency || ""} ${useType || ""}`.trim())}
                                className="text-[13px] text-cyan-600 hover:text-cyan-700 font-bold mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-cyan-50 hover:bg-cyan-100 transition-colors"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                สร้าง SIG อัตโนมัติ
                            </button>
                        )}
                    </FieldRow>

                    <SubHeader label="ฉลากและคำเตือน" />
                    <FieldRow label="ประเภทฉลาก">
                        <select
                            value={labelCustom ? "__custom__" : (LABEL_TYPE_OPTIONS.some(o => o.value === labelType) ? labelType : "")}
                            onChange={e => {
                                if (e.target.value === "__custom__") { setLabelCustom(true); setLabelType(""); return; }
                                setLabelCustom(false); setLabelType(e.target.value);
                            }}
                            className={selectCls}
                        >
                            <option value="">— เลือก —</option>
                            {LABEL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                        </select>
                        <Input value={labelType} onChange={e => setLabelType(e.target.value)} placeholder="พิมพ์เอง" className={`mt-1.5 ${inputCls} ${labelCustom ? "" : "hidden"}`} />
                    </FieldRow>
                    <FieldRow label={<span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />คำเตือน</span>}>
                        <Input
                            value={warningLabel}
                            onChange={e => setWarningLabel(e.target.value)}
                            placeholder="ระวังง่วงนอน / ห้ามขับขี่"
                            className={`${inputCls} border-red-200 focus-visible:ring-red-500/20 focus-visible:border-red-400 bg-red-50/30`}
                        />
                    </FieldRow>
                </div>
            </div>

            {/* ═══════════ SECTION 3: ราคา สต๊อก ค่าธรรมเนียม ═══════════ */}
            <div className="rounded-2xl border-2 border-emerald-200 shadow-sm bg-white overflow-hidden">
                <SectionTitle icon={CircleDollarSign} title="ราคา สต๊อก และค่าธรรมเนียม" color="emerald" />
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <SubHeader label="ราคาและสต๊อก" />
                    <FieldRow label="ราคาขาย (฿)" required>
                        <Input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="0" className={`${inputCls} tabular-nums font-bold text-emerald-700`} />
                    </FieldRow>
                    <FieldRow label="ต้นทุน (฿)">
                        <Input type="number" value={costPrice} onChange={e => setCostPrice(e.target.value)} className={`${inputCls} tabular-nums`} />
                    </FieldRow>
                    <FieldRow label="คงเหลือ">
                        <Input type="number" value={stockQty} onChange={e => setStockQty(e.target.value)} className={`${inputCls} text-blue-600 font-bold tabular-nums`} />
                    </FieldRow>
                    <FieldRow label="แจ้งเตือนต่ำสุด">
                        <Input type="number" value={minStock} onChange={e => setMinStock(e.target.value)} className={`${inputCls} tabular-nums`} />
                    </FieldRow>
                    <FieldRow label="ตัดสต๊อกอัตโนมัติ">
                        <select className={selectCls} value={autoCutStock} onChange={e => setAutoCutStock(e.target.value)}>
                            <option value="true">เปิด (Yes)</option>
                            <option value="false">ปิด (No)</option>
                        </select>
                    </FieldRow>
                    <FieldRow label="เลขล็อต (Lot)">
                        <Input value={lotNo} onChange={e => setLotNo(e.target.value)} placeholder="ล็อตของยอดตั้งต้น" className={`${inputCls} font-mono`} />
                    </FieldRow>
                    <FieldRow label="วันหมดอายุ (ล็อต)">
                        <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={inputCls} />
                    </FieldRow>
                    <FieldRow label="" colSpan={2}>
                        <p className="text-[11px] text-slate-400">เลขล็อต + วันหมดอายุนี้จะถูกบันทึกเป็น &quot;ล็อตตั้งต้น&quot; ของยอดคงเหลือ — รับเข้าล็อตใหม่ภายหลังได้ที่หน้าสินค้า</p>
                    </FieldRow>

                    <SubHeader label="ค่าธรรมเนียม (Doctor Fee)" />
                    <FieldRow label="DF แพทย์ (฿)">
                        <Input type="number" value={dfDoctor} onChange={e => setDfDoctor(e.target.value)} className={`${inputCls} tabular-nums`} />
                    </FieldRow>
                    <FieldRow label="DF พยาบาล (฿)">
                        <Input type="number" value={dfNurse} onChange={e => setDfNurse(e.target.value)} className={`${inputCls} tabular-nums`} />
                    </FieldRow>
                    <FieldRow label="DF ผู้ช่วย (฿)" colSpan={2}>
                        <Input type="number" value={dfAssistant} onChange={e => setDfAssistant(e.target.value)} className={`${inputCls} tabular-nums max-w-[280px]`} />
                    </FieldRow>

                    <SubHeader label="ข้อมูลเพิ่มเติม" />
                    <FieldRow label="ที่จัดเก็บ">
                        <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="ตู้ A ชั้น 2" className={inputCls} />
                    </FieldRow>
                    <FieldRow label="ผู้จำหน่าย">
                        <Input value={supplier} onChange={e => setSupplier(e.target.value)} className={inputCls} />
                    </FieldRow>
                    <FieldRow label="หมายเหตุ" colSpan={2}>
                        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="บันทึกช่วยจำ" className={inputCls} />
                    </FieldRow>
                </div>
            </div>

            {/* ═══════════ Bottom Sticky Action Bar ═══════════ */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t-2 border-slate-200 flex justify-end gap-3 z-50 px-6 sm:pl-72 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.15)]">
                <Button
                    variant="outline"
                    className="rounded-xl px-7 h-12 text-[16px] font-bold border-2"
                    onClick={() => router.push("/dashboard/inventory")}
                    disabled={loading}
                >
                    ยกเลิก
                </Button>
                <Button
                    className="rounded-xl px-9 h-12 text-[16px] font-bold bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white gap-2 shadow-lg shadow-blue-500/25"
                    onClick={handleSave}
                    disabled={loading}
                >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> :
                        saved ? <CheckCircle className="h-5 w-5" /> :
                            <Save className="h-5 w-5" />}
                    {saved ? "บันทึกสำเร็จ" : "บันทึกข้อมูลคลัง"}
                </Button>
            </div>
        </div>
    );
}

// ─── Frequency Picker (เช้า / กลางวัน / เย็น / ก่อนนอน) ───
const TIME_SLOTS = [
    { key: "เช้า", label: "เช้า", Icon: Sunrise },
    { key: "กลางวัน", label: "กลางวัน", Icon: Sun },
    { key: "เย็น", label: "เย็น", Icon: Sunset },
    { key: "ก่อนนอน", label: "ก่อนนอน", Icon: Moon },
];

const FREQUENCY_PRESETS = [
    { label: "ทุก 4 ชม.", value: "q4h" },
    { label: "ทุก 6 ชม.", value: "q6h" },
    { label: "ทุก 8 ชม.", value: "q8h" },
    { label: "ทุก 12 ชม.", value: "q12h" },
];

function FrequencyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const slotKeys = TIME_SLOTS.map(s => s.key);
    const selectedSlots = value
        .split(",")
        .map(s => s.trim())
        .filter(s => slotKeys.includes(s));
    const isPreset = FREQUENCY_PRESETS.some(p => p.value === value || p.label === value);
    const isCustom = value && selectedSlots.length === 0 && !isPreset;

    function toggleSlot(slot: string) {
        const set = new Set(selectedSlots);
        if (set.has(slot)) set.delete(slot);
        else set.add(slot);
        // Keep order from TIME_SLOTS
        const ordered = TIME_SLOTS.filter(s => set.has(s.key)).map(s => s.key);
        onChange(ordered.join(", "));
    }

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
                {TIME_SLOTS.map(slot => {
                    const active = selectedSlots.includes(slot.key);
                    return (
                        <button
                            key={slot.key}
                            type="button"
                            onClick={() => toggleSlot(slot.key)}
                            className={`h-11 rounded-lg border text-[15px] font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
                                active
                                    ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/25"
                                    : "bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50"
                            }`}
                        >
                            <slot.Icon className="h-4 w-4" />
                            {slot.label}
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
                {FREQUENCY_PRESETS.map(p => {
                    const active = value === p.value;
                    return (
                        <button
                            key={p.value}
                            type="button"
                            onClick={() => onChange(active ? "" : p.value)}
                            className={`px-2.5 h-7 rounded-md text-[13px] font-bold uppercase tracking-wider transition-all ${
                                active
                                    ? "bg-cyan-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                        >
                            {p.label}
                        </button>
                    );
                })}
            </div>
            {isCustom && (
                <Input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="หรือพิมพ์เอง..."
                    className="text-[15px] h-10 rounded-lg bg-white"
                />
            )}
        </div>
    );
}
