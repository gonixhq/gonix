"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { updateInventoryItem } from "@/lib/actions/inventory";
import { toast } from "@/lib/toast";
import RefCommField, { refCommPayload, teamPctPayload, type RefCommMode } from "@/components/finance/ref-comm-field";
import { Section, FieldRow, SubHeader as SubHeaderBase, FORM_INPUT_CLS, FORM_SELECT_CLS } from "@/components/ui/horizontal-form";
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
const CODE_PREFIX: Record<string, string> = { drug: "DRG", supply: "SUP", aesthetic_supply: "AES", service: "SVC" };

// ชนิดสินค้า (ข้อ 6) — เลือกก่อน แล้วฟอร์มโชว์เฉพาะช่องที่เกี่ยวข้อง
const ITEM_KINDS = [
    { k: "drug", label: "ยา", sub: "เม็ด/น้ำ/ครีม — มีฉลากยา", category: "drug", deduction: "unit_piece", segment: "medical" },
    { k: "aesthetic", label: "เวชภัณฑ์ความงาม", sub: "Botox/Filler/HIFU — เปิดขวดแบ่งใช้", category: "aesthetic_supply", deduction: "injectable_vial", segment: "aesthetic" },
    { k: "supply", label: "อุปกรณ์/วัสดุ", sub: "นับชิ้น ตัดทีละชิ้นตอนใช้", category: "supply", deduction: "unit_piece", segment: "product" },
    { k: "consumable", label: "วัสดุสิ้นเปลือง", sub: "สำลี/แอลกอฮอล์ — นับเป็นรอบ", category: "supply", deduction: "consumable_periodic", segment: "product" },
] as const;
type ItemKind = typeof ITEM_KINDS[number]["k"];
const kindOf = (category: string, deduction: string): ItemKind =>
    deduction === "injectable_vial" ? "aesthetic" : deduction === "consumable_periodic" ? "consumable" : category === "drug" ? "drug" : "supply";

// แบรนด์ยอดนิยมตามประเภทหัตถการ (ข้อ 9) — รวมกับแบรนด์ที่คลินิกเคยใช้
const BRAND_PRESET: Record<string, string[]> = {
    botox: ["Allergan (Botox)", "Hugel (Botulax)", "Daewoong (Nabota)", "Medytox (Neuronox)", "Merz (Xeomin)", "Galderma (Dysport)"],
    filler: ["Allergan (Juvederm)", "Galderma (Restylane)", "Teoxane", "Neuramis", "Elasty", "Exquiller", "Belotero"],
    skinbooster: ["Galderma (Restylane Skinboosters)", "Allergan (Juvederm Skinvive)", "Rejuran", "Profhilo"],
    biostimulator: ["Galderma (Sculptra)", "Merz (Radiesse)", "Ellanse"],
    hifu: ["Ulthera", "Ultraformer", "Doublo"],
};

// ค่าตั้งต้นตามประเภทหัตถการ (ข้อ 1) — หน่วยตัดสต๊อก / ภาชนะ / ความจุตัวอย่าง / อายุหลังเปิด
const PRODUCT_PRESET: Record<string, { unit: string; container: string; capPh: string; shelfHours?: number }> = {
    botox: { unit: "unit", container: "ขวด", capPh: "เช่น 100 (Botox 100u) หรือ 50", shelfHours: 24 },
    filler: { unit: "cc", container: "หลอด", capPh: "เช่น 1 หรือ 2 (cc ต่อหลอด)" },
    skinbooster: { unit: "cc", container: "หลอด", capPh: "เช่น 1 หรือ 2.5 (cc ต่อหลอด)" },
    biostimulator: { unit: "cc", container: "ขวด", capPh: "เช่น 1.5 (Radiesse) · Sculptra ใช้ทั้งขวดให้เลือกหน่วย \"ขวด\" ความจุ 1" },
    meso: { unit: "cc", container: "ขวด", capPh: "เช่น 5 หรือ 10 (cc ต่อขวด)" },
    fat_dissolve: { unit: "cc", container: "ขวด", capPh: "เช่น 10 (cc ต่อขวด)" },
    weight_loss: { unit: "mg", container: "ปากกา", capPh: "เช่น 3 (mg ต่อปากกา)" },
    iv_drip: { unit: "ขวด", container: "ขวด", capPh: "1 (ใช้ทั้งขวด)" },
    hifu: { unit: "shot", container: "ตลับ", capPh: "เช่น 10000 หรือ 20000 (shot ต่อตลับ)" },
    other: { unit: "unit", container: "ขวด", capPh: "ความจุต่อภาชนะ" },
};

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

// ประเภทหัตถการของฉีด (mig 122) — คุมจุดฉีด dropdown + รายงานแยกประเภท
const PRODUCT_TYPE_OPTIONS = [
    { value: "botox", label: "Botox (โบทูลินัม)" },
    { value: "filler", label: "Filler (ฟิลเลอร์)" },
    { value: "skinbooster", label: "Skinbooster" },
    { value: "biostimulator", label: "Biostimulator (Sculptra/Radiesse)" },
    { value: "meso", label: "Meso (เมโส)" },
    { value: "fat_dissolve", label: "สลายไขมัน (FAT)" },
    { value: "weight_loss", label: "Weight Loss" },
    { value: "iv_drip", label: "IV Drip / Vitamin" },
    { value: "hifu", label: "HIFU / RF (ตลับ)" },
    { value: "other", label: "อื่นๆ" },
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

// ใช้ layout เดียวกับหน้าเพิ่มผู้ป่วยใหม่ (shared horizontal-form) — adapter ให้ SubHeader รับ prop label เดิม
function SubHeader({ label }: { label: string }) {
    return <SubHeaderBase>{label}</SubHeaderBase>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function InventoryForm({ item }: { item?: any } = {}) {
    const router = useRouter();
    const supabase = createClient();
    const isEdit = !!item?.id;
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [codePreview, setCodePreview] = useState(item?.item_code || "Auto");
    const [showAdvanced, setShowAdvanced] = useState(false);   // หมวด/การตัดสต๊อก (ชนิดสินค้าตั้งให้แล้ว)

    // --- Section 1: Basic Info ---
    const [itemName, setItemName] = useState(item?.item_name || "");
    const [category, setCategory] = useState(item?.category || "drug");
    const [segment, setSegment] = useState(item?.segment || "medical");
    const [unit, setUnit] = useState(item?.unit || "");
    const [purchaseUnit, setPurchaseUnit] = useState(item?.purchase_unit || "");
    const [trackGroup, setTrackGroup] = useState(item?.track_group || "");
    const [unitsPerPack, setUnitsPerPack] = useState(item?.units_per_pack != null ? String(item.units_per_pack) : "");
    // ประเภทการตัดสต๊อก (P01) — เดาค่าเริ่มต้นจากข้อมูลเดิมถ้ายังไม่เคยตั้ง
    const [deductionType, setDeductionType] = useState<string>(
        item?.deduction_type || (item?.track_group ? "consumable_periodic" : item?.units_per_pack != null ? "injectable_vial" : "unit_piece")
    );
    // field เฉพาะเวชภัณฑ์ฉีด (P02)
    const [brand, setBrand] = useState(item?.brand || "");
    const [modelVariant, setModelVariant] = useState(item?.model_variant || "");
    const [capacityUnitLabel, setCapacityUnitLabel] = useState(item?.capacity_unit_label || "unit");
    const [productType, setProductType] = useState(item?.product_type || "");   // ประเภทหัตถการ (mig 122)
    const [brandOptions, setBrandOptions] = useState<string[]>([]);
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [brandModels, setBrandModels] = useState<{ brand: string; model: string }[]>([]);
    const [dupNames, setDupNames] = useState<{ id: string; item_name: string; item_code: string | null; is_active: boolean }[]>([]);
    const [genericName, setGenericName] = useState(item?.generic_name || "");
    const [tradeName, setTradeName] = useState(item?.trade_name || "");
    const [strengthValue, setStrengthValue] = useState(item?.strength || "");
    const [strengthUnit, setStrengthUnit] = useState(item?.strength ? "(none)" : "mg");
    const [dosageForm, setDosageForm] = useState(item?.dosage_form || "");
    const [dosageCustom, setDosageCustom] = useState(
        !!item?.dosage_form && !DOSAGE_FORM_OPTIONS.some(o => o.value === item.dosage_form));

    // Computed strength (e.g. "500mg")
    const strength = strengthValue
        ? `${strengthValue}${strengthUnit === "(none)" ? "" : strengthUnit}`
        : "";

    // --- Section 2: Label Info ---
    const [itemNameTh, setItemNameTh] = useState(item?.item_name_th || "");
    const [indication, setIndication] = useState(item?.indication || "");
    const [storageInfo, setStorageInfo] = useState(item?.storage_info || "");
    const [doseQty, setDoseQty] = useState(item?.dose_qty || "");
    const [frequency, setFrequency] = useState(item?.frequency || "");
    const [useType, setUseType] = useState(item?.use_type || "");
    const [labelType, setLabelType] = useState(item?.label_type || "");
    const [labelCustom, setLabelCustom] = useState(
        !!item?.label_type && !LABEL_TYPE_OPTIONS.some(o => o.value === item.label_type));
    const [warningLabel, setWarningLabel] = useState(item?.warning_label || "");
    const [sigTextDefault, setSigTextDefault] = useState(item?.sig_text_default || "");

    // --- Section 3: Price, Stock & Fees ---
    // ตัวเลข: 0/ว่าง → เก็บเป็น "" (ช่องว่าง + placeholder "0") ไม่ต้องลบเลข 0 ก่อนพิมพ์
    const [sellPrice, setSellPrice] = useState(item?.sell_price ? String(item.sell_price) : "");
    const [costPrice, setCostPrice] = useState(item?.cost_price ? String(item.cost_price) : "");
    const [stockQty, setStockQty] = useState(item?.stock_qty ? String(item.stock_qty) : "");
    const [minStock, setMinStock] = useState(item?.min_stock ? String(item.min_stock) : "");
    const [autoCutStock, setAutoCutStock] = useState(item ? (item.auto_cut_stock ? "true" : "false") : "true");
    const [expiryDate, setExpiryDate] = useState(item?.expiry_date ? String(item.expiry_date).slice(0, 10) : "");
    const [lotNo, setLotNo] = useState("");
    const [dfDoctor, setDfDoctor] = useState(item?.df_doctor ? String(item.df_doctor) : "");
    const [dfNurse, setDfNurse] = useState(item?.df_nurse ? String(item.df_nurse) : "");
    const [dfAssistant, setDfAssistant] = useState(item?.df_assistant ? String(item.df_assistant) : "");
    const [refMode, setRefMode] = useState<RefCommMode>((item?.ref_comm_mode as RefCommMode) || "");
    const [refVal, setRefVal] = useState(item?.ref_comm_value != null ? String(item.ref_comm_value) : "");
    const [teamPct, setTeamPct] = useState(item?.team_count_pct != null ? String(item.team_count_pct) : "");
    const [singleUse, setSingleUse] = useState(!!item?.single_use);
    const [openedShelfHours, setOpenedShelfHours] = useState(item?.opened_shelf_hours != null ? String(item.opened_shelf_hours) : "");
    const [costPerPack, setCostPerPack] = useState("");     // ทุนต่อขวด/หลอด → คำนวณทุนต่อหน่วยให้ (ข้อ 4)
    const [marginThreshold, setMarginThreshold] = useState(35);
    const [location, setLocation] = useState(item?.location || "");
    const [supplier, setSupplier] = useState(item?.supplier || "");
    const [note, setNote] = useState(item?.note || "");

    // เลือกประเภทหัตถการ → ตั้งหน่วย/ภาชนะ/แผนก/หมวดให้เอง (แก้ต่อได้)
    function applyProductType(v: string) {
        setProductType(v);
        const p = PRODUCT_PRESET[v];
        if (!p) return;
        setCapacityUnitLabel(p.unit); setUnit(p.unit);
        if (!purchaseUnit) setPurchaseUnit(p.container);
        if (["unit", "cc", "shot", "mg"].includes(p.unit) === false && !unitsPerPack) setUnitsPerPack("1");
        if (p.shelfHours && !openedShelfHours) setOpenedShelfHours(String(p.shelfHours));
        setSegment("aesthetic");
        if (category === "drug" || category === "supply") setCategory("aesthetic_supply");
    }

    // สร้างรหัสสินค้าอัตโนมัติ: PREFIX-NNNN ตามหมวดหมู่
    async function genItemCode(clinicId: string): Promise<string> {
        const prefix = CODE_PREFIX[category] || "ITM";
        const { count } = await supabase.from("inventory")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", clinicId).eq("category", category);
        return `${prefix}-${String((count || 0) + 1).padStart(4, "0")}`;
    }

    useEffect(() => {
        (async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                const { data: prof } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
                if (!prof?.clinic_id) return;
                const { data } = await supabase.rpc("fn_finance_rate", { p_clinic: prof.clinic_id, p_key: "margin_threshold_pct", p_date: new Date().toISOString().slice(0, 10) });
                if (data != null) setMarginThreshold(Number(data));
            } catch { /* ใช้ 35 */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // preview รหัสในช่อง — อัปเดตเมื่อเปลี่ยนหมวดหมู่ (เฉพาะตอนสร้างใหม่)
    useEffect(() => {
        if (isEdit) return;   // โหมดแก้ไข: ใช้ item_code เดิม
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

    // ดึงแบรนด์/รุ่นที่เคยมี ไว้ทำ datalist (free-select — เลือกเดิม หรือพิมพ์ใหม่)
    useEffect(() => {
        let alive = true;
        (async () => {
            const { data } = await supabase.from("inventory").select("brand, model_variant")
                .or("brand.not.is.null,model_variant.not.is.null");
            if (!alive || !data) return;
            setBrandOptions([...new Set(data.map(d => d.brand).filter(Boolean) as string[])].sort());
            setModelOptions([...new Set(data.map(d => d.model_variant).filter(Boolean) as string[])].sort());
            setBrandModels(data.filter(d => d.brand && d.model_variant).map(d => ({ brand: d.brand as string, model: d.model_variant as string })));
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ข้อ 7: เตือนชื่อซ้ำ/คล้าย (ก่อนบันทึก)
    useEffect(() => {
        const q = itemName.trim();
        if (q.length < 3 || (isEdit && q === item?.item_name)) { setDupNames([]); return; }
        const t = setTimeout(async () => {
            const first = q.split(/\s+/)[0].replace(/[%,()]/g, "");
            const { data } = await supabase.from("inventory").select("id, item_name, item_code, is_active")
                .ilike("item_name", `%${first}%`).limit(8);
            const norm = (x: string) => x.replace(/\s+/g, "").toLowerCase();
            setDupNames((data || []).filter(d => d.id !== item?.id && (norm(d.item_name as string).includes(norm(q)) || norm(q).includes(norm(d.item_name as string)) || norm(d.item_name as string).startsWith(norm(first))))
                .slice(0, 5) as typeof dupNames);
        }, 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itemName]);

    async function handleSave() {
        // ของฉีด: หน่วยนับ = หน่วยความจุ เสมอ (ช่องหน่วยนับถูกซ่อน) → บังคับให้ตรงตอนบันทึก
        const effectiveUnit = deductionType === "injectable_vial" ? capacityUnitLabel : unit;
        if (!itemName || !effectiveUnit || !sellPrice) {
            toast.error("กรุณากรอก ชื่อแสดง (Item Name), หน่วยนับ (Unit) และ ราคาขาย (Price)");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
            if (!profile?.clinic_id) throw new Error("Clinic ID not found");

            // ── โหมดแก้ไข — ใช้ updateInventoryItem (มี audit + ไม่แตะ stock_qty) ──
            if (isEdit) {
                const res = await updateInventoryItem({
                    id: item.id,
                    item_name: itemName, category, segment, unit: effectiveUnit,
                    purchase_unit: purchaseUnit || null, track_group: trackGroup || null,
                    units_per_pack: unitsPerPack ? parseFloat(unitsPerPack) : null,
                    deduction_type: deductionType || null,
                    brand: brand || null, model_variant: modelVariant || null,
                    capacity_unit_label: deductionType === "injectable_vial" ? capacityUnitLabel : null,
                    product_type: deductionType === "injectable_vial" ? (productType || null) : null,
                    generic_name: genericName, trade_name: tradeName, strength,
                    dosage_form: dosageForm.trim(),
                    item_name_th: itemNameTh, indication, storage_info: storageInfo,
                    dose_qty: doseQty, frequency, use_type: useType,
                    label_type: labelType.trim(), warning_label: warningLabel, sig_text_default: sigTextDefault,
                    sell_price: parseFloat(sellPrice) || 0, cost_price: parseFloat(costPrice) || 0,
                    min_stock: parseFloat(minStock) || 0, expiry_date: expiryDate || null,
                    df_doctor: parseFloat(dfDoctor) || 0, df_nurse: parseFloat(dfNurse) || 0, df_assistant: parseFloat(dfAssistant) || 0,
                    ...refCommPayload(refMode, refVal),
                ...teamPctPayload(teamPct),
                single_use: singleUse,
                    opened_shelf_hours: deductionType === "injectable_vial" && openedShelfHours ? Number(openedShelfHours) : null,
                    location, supplier, note,
                });
                if (!res.success) throw new Error(res.error || "บันทึกไม่สำเร็จ");
                setSaved(true);
                toast.success("บันทึกสินค้าแล้ว");
                setTimeout(() => { setSaved(false); router.push(`/dashboard/inventory/${item.id}`); router.refresh(); }, 1200);
                return;
            }

            const payload = {
                clinic_id: profile.clinic_id,
                item_code: await genItemCode(profile.clinic_id),
                item_name: itemName,
                category,
                segment,
                unit: effectiveUnit,
                purchase_unit: purchaseUnit || null,
                track_group: trackGroup || null,
                units_per_pack: unitsPerPack ? parseFloat(unitsPerPack) : null,
                deduction_type: deductionType || null,
                brand: brand || null,
                model_variant: modelVariant || null,
                capacity_unit_label: deductionType === "injectable_vial" ? capacityUnitLabel : null,
                product_type: deductionType === "injectable_vial" ? (productType || null) : null,
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
                ...refCommPayload(refMode, refVal),
                ...teamPctPayload(teamPct),
                single_use: singleUse,
                opened_shelf_hours: deductionType === "injectable_vial" && openedShelfHours ? Number(openedShelfHours) : null,
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
            toast.success("เพิ่มสินค้าใหม่แล้ว");
            setTimeout(() => {
                setSaved(false);
                router.push("/dashboard/inventory");
                router.refresh();
            }, 1500);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
        } finally {
            setLoading(false);
        }
    }

    // ใช้ class เดียวกับฟอร์มผู้ป่วย (โทนแบรนด์)
    const inputCls = FORM_INPUT_CLS;
    const selectCls = FORM_SELECT_CLS;

    // ฉลากยา/รูปแบบ/ความแรง = ผูกกับ "ชนิดสินค้า = ยา" เท่านั้น (ยกเว้นของฉีดแบบขวด)
    // แผนกรายได้ไม่เกี่ยว — ยาที่อยู่แผนก "ของใช้ทั่วไป" ก็ต้องมีฉลากยา
    // ถ้าเป็นสำลี/น้ำเกลือ ให้ตั้งชนิดสินค้าเป็น "เวชภัณฑ์" แล้วจะไม่โชว์ฉลากยาเอง
    const showDrugLabel = category === "drug" && deductionType !== "injectable_vial";

    return (
        <div className="space-y-5 pb-24 max-w-5xl mx-auto">
            {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl border-2 border-red-200 text-[15px] font-medium flex items-start gap-2">
                    <X className="h-5 w-5 shrink-0 mt-0.5" />
                    {error}
                </div>
            )}

            {/* ═══════════ ชนิดสินค้า (ข้อ 6) ═══════════ */}
            {(() => {
                const cur = kindOf(category, deductionType);
                return (
                    <div className="rounded-2xl bg-white/90 border border-slate-200 p-4">
                        <div className="text-sm font-bold text-slate-700 mb-2">ชนิดสินค้า {isEdit && <span className="text-xs font-normal text-slate-400">(เปลี่ยนได้ แต่ระวังสต๊อก/ล็อตเดิม)</span>}</div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            {ITEM_KINDS.map(k => (
                                <button key={k.k} type="button" onClick={() => {
                                    setCategory(k.category); setDeductionType(k.deduction); setSegment(k.segment);
                                    if (k.deduction === "injectable_vial" && !unit) setUnit(capacityUnitLabel);
                                }} className={`text-left rounded-xl border-2 px-3 py-2.5 transition-all ${cur === k.k ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                                    <div className={`font-bold ${cur === k.k ? "text-blue-800" : "text-slate-700"}`}>{k.label}</div>
                                    <div className="text-[11px] text-slate-500">{k.sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* ═══════════ SECTION 1: ข้อมูลพื้นฐาน ═══════════ */}
            <Section title="ข้อมูลพื้นฐาน" icon={FileText} color="teal">
                    <FieldRow label="รหัส">
                        <div className="flex items-center gap-2">
                            <Input value={codePreview} disabled className={`${inputCls} bg-slate-100 text-slate-500 border-dashed font-mono`} />
                            <button type="button" onClick={() => setShowAdvanced(v => !v)} className="shrink-0 text-xs text-blue-700 underline whitespace-nowrap">{showAdvanced ? "ซ่อนตั้งค่าขั้นสูง" : "หมวด/การตัดสต๊อก"}</button>
                        </div>
                    </FieldRow>
                    <FieldRow label="หมวดหมู่" hidden={!showAdvanced} hint="ยา = มีฉลาก/วิธีใช้ (DRG) · เวชภัณฑ์ = อุปกรณ์/วัสดุ (SUP) · เวชภัณฑ์ความงาม = Botox/Filler/HIFU ฯลฯ (AES)">
                        <select className={selectCls} value={category} onChange={e => setCategory(e.target.value)}>
                            <option value="drug">ยา (Drug)</option>
                            <option value="supply">เวชภัณฑ์ (Supply)</option>
                            <option value="aesthetic_supply">เวชภัณฑ์ความงาม (ฉีด/หัตถการ)</option>
                            {/* "บริการ" เอาออกจากคลังสินค้า — สร้างบริการที่ "รายการบริการ & ราคา" แทน
                                (โชว์เฉพาะของเก่าที่เคยตั้ง category=service ไว้ ให้แก้ได้ไม่พัง) */}
                            {category === "service" && <option value="service">บริการ (Service) — เลิกใช้ ให้ย้ายไปหน้าบริการ</option>}
                        </select>
                    </FieldRow>

                    <FieldRow label="แผนก (รายได้)" hint="รายได้เข้าแผนกไหน (ไว้แยกรายงาน) — คนละเรื่องกับชนิดสินค้า เช่น 'ยา' ก็อยู่แผนก 'การแพทย์' ได้">
                        <select className={selectCls} value={segment} onChange={e => setSegment(e.target.value)}>
                            <option value="medical">การแพทย์ (โรคทั่วไป)</option>
                            <option value="aesthetic">ความงาม</option>
                            <option value="product">ของใช้ทั่วไป (สำลี/น้ำเกลือ/เข็ม)</option>
                        </select>
                    </FieldRow>

                    <FieldRow label="ชื่อแสดง" required colSpan={2}>
                        <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder={deductionType === "injectable_vial" ? "เช่น Juvederm Volbella 1cc" : deductionType === "consumable_periodic" ? "เช่น สำลีก้อน" : category === "drug" ? "เช่น Paracetamol 500mg" : "เช่น เข็ม 27G"} className={inputCls} />
                        {dupNames.length > 0 && (
                            <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                <b>มีสินค้าชื่อคล้ายกันในคลังแล้ว</b> — ตรวจก่อนสร้างซ้ำ:
                                <ul className="mt-1 space-y-0.5">
                                    {dupNames.map(d => (
                                        <li key={d.id}><a href={`/dashboard/inventory/${d.id}`} target="_blank" rel="noopener noreferrer" className="underline font-semibold">{d.item_name}</a> <span className="text-amber-700 font-mono">{d.item_code || ""}</span>{!d.is_active && <span className="text-slate-500"> (ปิดใช้งาน)</span>}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </FieldRow>

                    <FieldRow label="ชื่อสามัญ" hidden={!showDrugLabel}>
                        <Input value={genericName} onChange={e => setGenericName(e.target.value)} placeholder="Paracetamol" className={inputCls} />
                    </FieldRow>
                    <FieldRow label="ชื่อการค้า" hidden={!showDrugLabel}>
                        <Input value={tradeName} onChange={e => setTradeName(e.target.value)} placeholder="Tylenol" className={inputCls} />
                    </FieldRow>

                    {/* ของฉีด: หน่วยนับ = หน่วยความจุ อัตโนมัติ (ซ่อนช่องนี้ ไม่ให้งง) */}
                    <FieldRow label="หน่วยนับ" required hidden={deductionType === "injectable_vial"}>
                        <Input list="unit-options" value={unit} onChange={e => setUnit(e.target.value)} placeholder="พิมพ์ หรือเลือก ▼" className={inputCls} />
                        <datalist id="unit-options">
                            {UNIT_OPTIONS.map(u => <option key={u} value={u} />)}
                        </datalist>
                    </FieldRow>

                    {/* ประเภทการตัดสต๊อก (P01) — ตัวสลับหลักว่าของชิ้นนี้ตัดสต๊อกแบบไหน */}
                    <FieldRow label="การตัดสต๊อก" required colSpan={2} hidden={!showAdvanced}>
                        <select value={deductionType} onChange={e => {
                            const v = e.target.value;
                            setDeductionType(v);
                            // สลับเป็นของฉีด → หน่วยนับตามหน่วยความจุ (u/cc/shot) อัตโนมัติ
                            if (v === "injectable_vial" && !unit) setUnit(capacityUnitLabel);
                            if (v === "injectable_vial" && !isEdit) { setSegment("aesthetic"); if (category === "drug") setCategory("aesthetic_supply"); }
                        }} className={selectCls}>
                            <option value="injectable_vial">เวชภัณฑ์ฉีด — เปิดขวดแล้วแบ่งใช้ (Botox/Filler/HIFU) · track lot</option>
                            <option value="unit_piece">นับชิ้น — ตัดทีละชิ้นตอนใช้ (ยาเม็ด/อุปกรณ์)</option>
                            <option value="consumable_periodic">วัสดุสิ้นเปลือง — ไม่ตัดต่อเคส นับเป็นรอบ (สำลี/แอลกอฮอล์)</option>
                        </select>
                    </FieldRow>

                    {/* ── ฉีด: แบรนด์/รุ่น/ขนาดขวด (lot/expiry บังคับตอนรับเข้า) ── */}
                    {deductionType === "injectable_vial" && (
                        <>
                            <FieldRow label="ประเภทหัตถการ" colSpan={2} hint="เลือกแล้วระบบตั้งหน่วยตัดสต๊อก ภาชนะ แผนก 'ความงาม' ให้เอง (แก้ต่อได้)">
                                {/* คุมจุดฉีด dropdown ในหน้าหมอ + รายงานแยกประเภท (แยกจากแผนก/รายได้) */}
                                <select value={productType} onChange={e => applyProductType(e.target.value)} className={selectCls}>
                                    <option value="">— เลือกประเภท —</option>
                                    {PRODUCT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </FieldRow>
                            <FieldRow label="แบรนด์">
                                <Input list="brand-options" value={brand} onChange={e => setBrand(e.target.value)} placeholder="เช่น Allergan, Galderma" className={inputCls} />
                                <datalist id="brand-options">{[...new Set([...brandOptions, ...(BRAND_PRESET[productType] || [])])].map(b => <option key={b} value={b} />)}</datalist>
                            </FieldRow>
                            <FieldRow label="รุ่น / variant">
                                <Input list="model-options" value={modelVariant} onChange={e => setModelVariant(e.target.value)} placeholder="เช่น Voluma, Volbella" className={inputCls} />
                                <datalist id="model-options">{(brand && brandModels.some(x => x.brand === brand) ? [...new Set(brandModels.filter(x => x.brand === brand).map(x => x.model))] : modelOptions).map(m => <option key={m} value={m} />)}</datalist>
                            </FieldRow>
                            <FieldRow label="หน่วยที่ตัดสต๊อก" required hint="หน่วยที่ใช้ต่อเคส — ฉีดแบ่งจากขวดใช้ unit/cc/shot · ใช้ทีละขวด/หลอดทั้งชิ้นเลือกกลุ่ม &quot;ใช้ทั้งชิ้น&quot; (ความจุ = 1)">
                                {/* หน่วยจริงที่นับ/ตัด (u/cc/shot) — sync ไป unit ด้วย ผู้ใช้ไม่ต้องกรอกซ้ำ */}
                                <select value={capacityUnitLabel} onChange={e => { setCapacityUnitLabel(e.target.value); setUnit(e.target.value); }} className={selectCls}>
                                    <optgroup label="แบ่งใช้ตามปริมาณ">
                                        <option value="unit">unit</option>
                                        <option value="cc">cc</option>
                                        <option value="shot">shot</option>
                                        <option value="mg">mg</option>
                                        {capacityUnitLabel === "ml" && <option value="ml">ml</option>}
                                    </optgroup>
                                    <optgroup label="ใช้ทั้งชิ้น">
                                        <option value="ขวด">ขวด</option>
                                        <option value="ไวอัล">ไวอัล</option>
                                        <option value="หลอด">หลอด</option>
                                        <option value="แอมป์">แอมป์</option>
                                        <option value="เข็ม">เข็ม</option>
                                        <option value="ชิ้น">ชิ้น</option>
                                        <option value="ซอง">ซอง</option>
                                        <option value="กล่อง">กล่อง</option>
                                        <option value="ครั้ง">ครั้ง</option>
                                    </optgroup>
                                    {capacityUnitLabel && !["unit", "cc", "shot", "mg", "ml", "ขวด", "ไวอัล", "หลอด", "แอมป์", "เข็ม", "ชิ้น", "ซอง", "กล่อง", "ครั้ง"].includes(capacityUnitLabel) && <option value={capacityUnitLabel}>{capacityUnitLabel}</option>}
                                </select>
                            </FieldRow>
                            <FieldRow label="ภาชนะ">
                                <Input value={purchaseUnit} onChange={e => setPurchaseUnit(e.target.value)} placeholder="ขวด / หลอด / ตลับ" className={inputCls} />
                            </FieldRow>
                            <FieldRow label={`ความจุต่อ${purchaseUnit || "ขวด"}`} hint={`กี่ ${capacityUnitLabel} ต่อ 1 ${purchaseUnit || "ขวด"} (ค่าตั้งต้น — ระบุต่อล็อตได้ตอนรับเข้า)`}>
                                <Input type="number" min={0} value={unitsPerPack} onChange={e => setUnitsPerPack(e.target.value)} placeholder={PRODUCT_PRESET[productType]?.capPh || "เช่น 100 (Botox 100u), 2 (Filler 2cc), 20000 (HIFU)"} className={inputCls} />
                            </FieldRow>
                            <FieldRow label="อายุหลังเปิด/ผสม" hint="กี่ชั่วโมงหลังเปิดขวดต้องทิ้ง — ระบบเตือนขวดเปิดค้างเกินเวลา (เว้นว่าง = ไม่กำหนด)">
                                <div className="flex items-center gap-2">
                                    <Input type="number" min={0} value={openedShelfHours} onChange={e => setOpenedShelfHours(e.target.value)} placeholder="เช่น 24" className={`${inputCls} tabular-nums max-w-[140px]`} />
                                    <span className="text-sm text-slate-500">ชั่วโมง</span>
                                </div>
                            </FieldRow>
                            <div className="col-span-2 text-[11px] text-slate-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 space-y-1">
                                {unitsPerPack && Number(unitsPerPack) > 0 && (
                                    <div>1 {purchaseUnit || "ขวด"} = <b>{Number(unitsPerPack).toLocaleString()} {capacityUnitLabel}</b> · ตัดสต๊อก/ขายเป็น <b>{capacityUnitLabel}</b> (รับเข้า 1 {purchaseUnit || "ขวด"} ระบบบวก {Number(unitsPerPack).toLocaleString()} {capacityUnitLabel} ให้เอง)</div>
                                )}
                                <div>เลข lot + วันหมดอายุจะ<b>บังคับกรอกตอนรับเข้าสต๊อก</b> (ขวดหลายขนาดระบุความจุต่อล็อตได้)</div>
                            </div>
                        </>
                    )}

                    {/* ── นับชิ้น: หน่วยใหญ่ + อัตราแปลง (ไม่บังคับ) ── */}
                    {deductionType === "unit_piece" && (
                        <>
                            <FieldRow label="หน่วยใหญ่">
                                <Input value={purchaseUnit} onChange={e => setPurchaseUnit(e.target.value)} placeholder="เช่น กล่อง, แพ็ก" className={inputCls} />
                            </FieldRow>
                            <FieldRow label="อัตราแปลง" hint="1 หน่วยใหญ่ = กี่หน่วยย่อย">
                                <Input type="number" min={0} value={unitsPerPack} onChange={e => setUnitsPerPack(e.target.value)} placeholder="เช่น 100" className={inputCls} />
                            </FieldRow>
                        </>
                    )}

                    {/* ── สิ้นเปลือง: กลุ่มนับ + อัตราแปลง (นับเป็นรอบ ไม่ตัดต่อเคส) ── */}
                    {deductionType === "consumable_periodic" && (
                        <>
                            <FieldRow label="หน่วยใหญ่">
                                <Input value={purchaseUnit} onChange={e => setPurchaseUnit(e.target.value)} placeholder="เช่น กล่อง, แพ็ก" className={inputCls} />
                            </FieldRow>
                            <FieldRow label="อัตราแปลง" hint="1 หน่วยใหญ่ = กี่หน่วยย่อย">
                                <Input type="number" min={0} value={unitsPerPack} onChange={e => setUnitsPerPack(e.target.value)} placeholder="เช่น 100" className={inputCls} />
                            </FieldRow>
                            <FieldRow label="กลุ่มนับ" colSpan={2}>
                                <select value={trackGroup} onChange={e => setTrackGroup(e.target.value)} className={selectCls}>
                                    <option value="">— ไม่ระบุ —</option>
                                    <option value="A">A — นับระดับ Pack (สำลี/แอลกอฮอล์/ถุงมือ)</option>
                                    <option value="B">B — นับระดับหน่วย (เข็ม/ยาชา/น้ำเกลือ)</option>
                                    <option value="C">C — ไม่ track (ทิชชู่/สบู่/ถุงขยะ)</option>
                                </select>
                            </FieldRow>
                            <div className="col-span-2 text-[11px] text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                ไม่ตัดสต๊อกต่อเคส — นับจริงเป็นรอบที่หน้า &quot;นับสต๊อก&quot; (Stock Count)
                            </div>
                        </>
                    )}
                    <FieldRow label="รูปแบบ" hidden={!showDrugLabel}>
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

                    <FieldRow label="พิมพ์รูปแบบ" colSpan={2} hidden={!dosageCustom || !showDrugLabel}>
                        <Input value={dosageForm} onChange={e => setDosageForm(e.target.value)} placeholder="พิมพ์รูปแบบเอง" className={inputCls} />
                    </FieldRow>

                    <FieldRow label="ความแรง" colSpan={2} hidden={!showDrugLabel}>
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
            </Section>

            {/* ═══════════ SECTION 2: ข้อมูลฉลากยา (เฉพาะ "ยา" — เวชภัณฑ์/ของใช้ทั่วไป/ของฉีด ไม่มี SIG/ฉลากยา) ═══════════ */}
            {showDrugLabel && (
            <Section title="ข้อมูลฉลากยา" icon={Tag} color="amber">
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
                                onClick={() => {
                                    const u = sigDoseUnit(dosageForm, unit);
                                    const appendU = u && !/[a-zA-Zก-๙]/.test(doseQty || "");
                                    setSigTextDefault(`รับประทานครั้งละ ${doseQty || "—"}${appendU ? " " + u : ""} ${frequency || ""} ${useType || ""}`.replace(/\s+/g, " ").trim());
                                }}
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
            </Section>
            )}

            {/* ═══════════ SECTION 3: ราคา สต๊อก ═══════════ */}
            <Section title="ราคา และสต๊อก" icon={CircleDollarSign} color="emerald">
                    <SubHeader label="ราคาและค่าตอบแทน" />
                    {deductionType === "injectable_vial" && Number(unitsPerPack) > 0 && (
                        <FieldRow label={`ทุน/${purchaseUnit || "ขวด"}`} hint={`กรอกราคาที่ซื้อจริงต่อ${purchaseUnit || "ขวด"} — ระบบหารเป็นทุนต่อ ${capacityUnitLabel} ให้`} colSpan={2}>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Input type="number" min={0} value={costPerPack} onChange={e => { setCostPerPack(e.target.value); const v = parseFloat(e.target.value); if (v > 0) setCostPrice(String(Math.round(v / Number(unitsPerPack) * 100) / 100)); }}
                                    placeholder={costPrice ? String(Math.round(Number(costPrice) * Number(unitsPerPack) * 100) / 100) : "เช่น 6000"} className={`${inputCls} tabular-nums max-w-[180px]`} />
                                <span className="text-sm text-slate-500">÷ {Number(unitsPerPack).toLocaleString()} {capacityUnitLabel} = ทุน <b className="text-slate-800 tabular-nums">฿{(Number(costPrice) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>/{capacityUnitLabel}</span>
                            </div>
                        </FieldRow>
                    )}
                    <FieldRow label={deductionType === "injectable_vial" ? `ราคาขาย/${capacityUnitLabel}` : "ราคาขาย"} required>
                        <Input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="0" className={`${inputCls} tabular-nums font-bold text-emerald-700`} />
                    </FieldRow>
                    <FieldRow label={deductionType === "injectable_vial" ? `ต้นทุน/${capacityUnitLabel}` : "ต้นทุน"} hint={(() => {
                        const sp = Number(sellPrice) || 0, cp = Number(costPrice) || 0;
                        if (!(sp > 0 && cp > 0)) return undefined;
                        const m = Math.round((sp - cp) / sp * 1000) / 10;
                        return m < marginThreshold ? `⚠ มาร์จิ้นวัสดุ ${m}% — ต่ำกว่าเกณฑ์ ${marginThreshold}%` : `มาร์จิ้นวัสดุ ${m}%`;
                    })()}>
                        <Input type="number" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
                    </FieldRow>
                    {segment === "aesthetic" && (
                        <FieldRow label="คอมแนะนำ" colSpan={2} hint="จ่ายพนักงานที่พาลูกค้ามา (คิดตอนรับเงิน) · นับเข้าคอมทีม % (ผ่าตัดที่อื่น = 40) · ค่ามือหัตถการตั้งที่เมนูบริการ">
                            <RefCommField mode={refMode} value={refVal} onChange={(m, v) => { setRefMode(m); setRefVal(v); }} teamPct={teamPct} onTeamPct={setTeamPct} />
                        </FieldRow>
                    )}
                    <SubHeader label="สต๊อก" />
                    <FieldRow label="คงเหลือ">
                        {isEdit ? (
                            <div className="flex items-center gap-2">
                                <Input type="number" value={stockQty} disabled className={`${inputCls} text-slate-500 font-bold tabular-nums bg-slate-100 max-w-[120px]`} />
                                <span className="text-[11px] text-slate-400">แก้สต๊อกที่ปุ่ม &quot;รับยาเข้า / ปรับสต๊อก&quot; (มี audit แยก)</span>
                            </div>
                        ) : (
                            <Input type="number" value={stockQty} onChange={e => setStockQty(e.target.value)} placeholder="0" className={`${inputCls} text-blue-600 font-bold tabular-nums`} />
                        )}
                    </FieldRow>
                    <FieldRow label="แจ้งเตือนต่ำสุด">
                        <Input type="number" value={minStock} onChange={e => setMinStock(e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
                    </FieldRow>
                    <FieldRow label="ใช้ครั้งเดียวทิ้ง">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                            <input type="checkbox" checked={singleUse} onChange={e => setSingleUse(e.target.checked)} className="h-4 w-4" />
                            คิดต้นทุนเต็มแพ็ก/หลอด แม้ใช้ไม่หมด
                        </label>
                    </FieldRow>
                    <FieldRow label="ตัดสต๊อกอัตโนมัติ">
                        <select className={selectCls} value={autoCutStock} onChange={e => setAutoCutStock(e.target.value)}>
                            <option value="true">เปิด (Yes)</option>
                            <option value="false">ปิด (No)</option>
                        </select>
                    </FieldRow>
                    <FieldRow label="เลขล็อต (Lot)" hidden={isEdit}>
                        <Input value={lotNo} onChange={e => setLotNo(e.target.value)} placeholder="ล็อตของยอดตั้งต้น" className={`${inputCls} font-mono`} />
                    </FieldRow>
                    <FieldRow label="วันหมดอายุ">
                        <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={inputCls} />
                    </FieldRow>
                    <FieldRow label="" colSpan={2} hidden={isEdit}>
                        <p className="text-[11px] text-slate-400">เลขล็อต + วันหมดอายุนี้จะถูกบันทึกเป็น &quot;ล็อตตั้งต้น&quot; ของยอดคงเหลือ — รับเข้าล็อตใหม่ภายหลังได้ที่หน้าสินค้า</p>
                    </FieldRow>

                    {/* ค่าธรรมเนียม (DF ต่อหน่วย) เอาออกจากหน้าคลัง — คลินิกคิด commission เป็น % ของยอดขาย
                        (state dfDoctor/Nurse/Assistant คงไว้ → payload ส่งค่าเดิม ไม่ลบข้อมูลของเก่า) */}

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
            </Section>

            {/* ═══════════ สรุปก่อนบันทึก ═══════════ */}
            {itemName.trim() && (() => {
                const segLabel: Record<string, string> = { medical: "การแพทย์", aesthetic: "ความงาม", product: "ของใช้ทั่วไป" };
                const catLabel: Record<string, string> = { drug: "ยา", supply: "เวชภัณฑ์", aesthetic_supply: "เวชภัณฑ์ความงาม", service: "บริการ" };
                const inj = deductionType === "injectable_vial";
                const u = inj ? capacityUnitLabel : (unit || "หน่วย");
                const sp = Number(sellPrice) || 0, cp = Number(costPrice) || 0;
                const margin = sp > 0 && cp > 0 ? Math.round((sp - cp) / sp * 1000) / 10 : null;
                const refLabel = refMode === "pct" ? `คอมแนะนำ ${refVal || 0}%` : refMode === "fixed" ? `คอมแนะนำ ฿${refVal || 0}/รายการ` : refMode === "per_unit" ? `คอมแนะนำ ฿${refVal || 0}/${u}` : refMode === "none" ? "ไม่มีคอมแนะนำ" : "คอมแนะนำตามค่ามาตรฐาน";
                const warn = (inj && segment !== "aesthetic") || (margin != null && margin < marginThreshold);
                return (
                    <div className={`rounded-2xl border p-4 text-sm ${warn ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50/60"}`}>
                        <div className="font-bold text-slate-800 mb-1">สรุปก่อนบันทึก</div>
                        <div className="text-slate-700 leading-relaxed">
                            <b>{itemName}</b>{brand ? ` · ${brand}${modelVariant ? ` ${modelVariant}` : ""}` : ""} · {catLabel[category] || category} · แผนก<b>{segLabel[segment] || segment}</b>
                            {" · "}ตัดสต๊อกเป็น <b>{u}</b>
                            {inj && Number(unitsPerPack) > 0 && <> · 1 {purchaseUnit || "ขวด"} = {Number(unitsPerPack).toLocaleString()} {u}</>}
                            {cp > 0 && <> · ทุน ฿{cp.toLocaleString()}/{u}</>}
                            {sp > 0 && <> · ขาย ฿{sp.toLocaleString()}/{u}</>}
                            {margin != null && <> · มาร์จิ้นวัสดุ <b className={margin < marginThreshold ? "text-rose-600" : "text-emerald-700"}>{margin}%</b></>}
                            {" · "}{refLabel}
                            {inj && openedShelfHours && <> · เปิดแล้วอยู่ได้ {openedShelfHours} ชม.</>}
                        </div>
                        {inj && segment !== "aesthetic" && <div className="text-xs text-amber-800 mt-1">⚠ เวชภัณฑ์ฉีดแต่แผนกไม่ใช่ &quot;ความงาม&quot; — จะไม่นับคอมแนะนำ/คอมทีม</div>}
                        {margin != null && margin < marginThreshold && <div className="text-xs text-amber-800 mt-1">⚠ มาร์จิ้นต่ำกว่าเกณฑ์ {marginThreshold}% (ก่อนหักค่ามือ/DF)</div>}
                    </div>
                );
            })()}

            {/* ═══════════ Bottom Sticky Action Bar ═══════════ */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t-2 border-slate-200 flex justify-end gap-3 z-50 px-6 sm:pl-72 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.15)]">
                <Button
                    variant="outline"
                    className="rounded-xl px-7 h-12 text-[16px] font-bold border-2"
                    onClick={() => router.push(isEdit ? `/dashboard/inventory/${item.id}` : "/dashboard/inventory")}
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
                    {saved ? "บันทึกสำเร็จ" : isEdit ? "บันทึกการแก้ไข" : "บันทึกข้อมูลคลัง"}
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
    { label: "ทุก 4 ชม.", value: "ทุก 4 ชั่วโมง" },
    { label: "ทุก 6 ชม.", value: "ทุก 6 ชั่วโมง" },
    { label: "ทุก 8 ชม.", value: "ทุก 8 ชั่วโมง" },
    { label: "ทุก 12 ชม.", value: "ทุก 12 ชั่วโมง" },
];

// หน่วยขนาดยาสำหรับ SIG (ไทย) — เลือกจากรูปแบบยา ก่อน แล้ว fallback หน่วยนับ
function sigDoseUnit(dosageForm: string, unit: string): string {
    const FORM: Record<string, string> = { Tab: "เม็ด", Cap: "แคปซูล", Syr: "มล.", Susp: "มล.", Sol: "มล.", Drop: "หยด" };
    if (FORM[dosageForm]) return FORM[dosageForm];
    const u = (unit || "").trim().toLowerCase();
    const UNIT: Record<string, string> = { tablet: "เม็ด", tab: "เม็ด", capsule: "แคปซูล", cap: "แคปซูล", bottle: "ขวด", ml: "มล.", drop: "หยด", sachet: "ซอง" };
    return UNIT[u] || (unit || "").trim();
}

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
