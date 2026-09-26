"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Printer, CheckCircle2, ChevronLeft,
    Pill, Plus, Trash2, X, AlertCircle, Sparkles, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { completeCheckout, type InvoiceItemInput } from "./checkout-actions";
import { validateCampaignCode, type ValidatedCampaign } from "@/lib/actions/campaigns";
import type { DiscountEntry } from "@/lib/campaign-types";
import type { ServiceCatalogItem } from "@/lib/service-types";
import { listActivePackages, getPatientActivePackages, consumePackageSession } from "@/lib/actions/packages";
import type { ServicePackage, PatientPackageActive } from "@/lib/package-types";
import PaymentEditor from "./payment-editor";
import { paymentPlan, type PaymentDraft } from "@/lib/checkout-payment";
import CheckoutAppointmentForm from "./checkout-appointment-form";
import HandStaffPicker, { type HandPick } from "@/components/packages/hand-staff-picker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Visit = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrugOrder = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LabOrder = any;

const ITEM_TYPE_LABEL: Record<string, string> = {
    doctor_fee: "ค่าตรวจ",
    drug: "ค่ายา",
    lab: "ค่าแล็บ",
    procedure: "ค่าหัตถการ",
    service: "ค่าบริการ",
    supply: "ค่าวัสดุ",
    injectable: "ฉีด (ขวด)",
    package: "คอสบริการ",
    other: "อื่นๆ",
};

const ITEM_TYPE_COLOR: Record<string, string> = {
    doctor_fee: "bg-cyan-100 text-cyan-700",
    drug: "bg-amber-100 text-amber-700",
    lab: "bg-purple-100 text-purple-700",
    procedure: "bg-rose-100 text-rose-700",
    service: "bg-blue-100 text-blue-700",
    supply: "bg-indigo-100 text-indigo-700",
    injectable: "bg-violet-100 text-violet-700",
    package: "bg-rose-100 text-rose-700",
    other: "bg-slate-100 text-slate-700",
};

interface LineItem {
    id: string;             // local UI id
    item_type: string;      // doctor_fee, drug, lab, ...
    item_ref_id?: string;   // reference to drug_order.id / lab_order.id (optional)
    label_source?: "order" | "inventory";
    item_name: string;
    qty: number;
    unit_price: number;
    locked?: boolean;       // ลบไม่ได้ (เช่น ค่าตรวจ)
    segment?: string | null;  // แผนกรายได้ (จาก source)
    max_discount_pct?: number | null;  // เพดานส่วนลด (เฉพาะคอส) — null = ไม่จำกัด
    line_discount?: number;   // ส่วนลดเฉพาะรายการนี้ (บาท)
    performer?: string;       // staff.id ของแพทย์ผู้ทำ | NOT_DOCTOR | "" (ยังไม่เลือก)
    hand_main?: string;       // staff.id ผู้ปฏิบัติหลัก (ค่ามือ) | "" = ไม่มี
    hand_asst?: string;       // staff.id ผู้ช่วย (ค่ามือ) | "" = ไม่มี
    // ── ของฉีด (injectable): ขายเป็น "ก้อน" ไม่ใช่ต่อหน่วย ──
    // qty = จำนวนที่ฉีด (ยูนิต/cc/shot → ตัดสต๊อก vial) · block_price = ราคาขายก้อน (คิดเงิน)
    block_price?: number;     // ราคาก้อน (เฉพาะ injectable) — เป็น source of truth ของยอด ไม่ผูกกับ qty
    unit_label?: string;      // u / cc / shot (แสดงข้าง qty)
}

// DF แพทย์ % (เฟส 2B): เลือก "แพทย์ผู้ทำ" รายบรรทัด — ยา/แล็บ/วัสดุ/คอส ไม่มี DF แพทย์
const DF_ELIGIBLE = new Set(["doctor_fee", "procedure", "service", "injectable", "other"]);
const NOT_DOCTOR = "__none__";
// ค่ามือ (เฟส 2C): ผู้ปฏิบัติหลัก/ผู้ช่วย รายบรรทัด — อัตราจากเมนูบริการ/คลังยา คิดที่ DB
const HAND_ELIGIBLE = new Set(["procedure", "service", "injectable", "other"]);
const BILL_TYPES: { v: BillType; label: string; hint?: string }[] = [
    { v: "normal", label: "ปกติ" },
    { v: "review", label: "เคสรีวิว", hint: "ค่ามือเต็ม · นับเป็นต้นทุนการตลาด" },
    { v: "free_fix", label: "แก้ไขฟรี", hint: "ค่ามือครึ่งหนึ่ง" },
];
type BillType = "normal" | "review" | "free_fix";

let uidCounter = 0;
const uid = () => `item-${Date.now()}-${++uidCounter}`;

/** ยอดเต็มของรายการ (ก่อนส่วนลด):
 *  ของฉีดขายเป็นก้อน → ใช้ block_price ตรงๆ (ไม่ผูก qty×unit_price) · อื่นๆ = qty × ต่อหน่วย */
const lineGross = (it: LineItem) =>
    it.item_type === "injectable" && it.block_price != null && it.block_price >= 0
        ? it.block_price
        : it.qty * it.unit_price;

interface InventoryDrug {
    id: string;
    item_name: string;
    generic_name: string | null;
    strength: string | null;
    dosage_form: string | null;
    unit: string;
    sell_price: number;
    stock_qty: number;
    category?: string;  // 'drug' | 'supply'
    segment?: string | null;
    deduction_type?: string | null;   // injectable_vial → ตัดผ่าน vial
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Injection = any;

export default function CheckoutForm({
    visit,
    drugOrders,
    labOrders,
    services = [],
    inventoryDrugs = [],
    injections = [],
    canBackdate = false,
    doctors = [],
    handStaff = [],
}: {
    visit: Visit;
    drugOrders: DrugOrder[];
    labOrders: LabOrder[];
    services?: ServiceCatalogItem[];
    inventoryDrugs?: InventoryDrug[];
    injections?: Injection[];
    canBackdate?: boolean;
    doctors?: { id: string; name: string }[];
    handStaff?: { id: string; name: string; role: string }[];
}) {
    const router = useRouter();
    const p = Array.isArray(visit.patients) ? visit.patients[0] : (visit.patients || visit.patient);
    const ptAge = p?.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : null;
    const ptGender = p?.gender === "M" ? "ชาย" : p?.gender === "F" ? "หญิง" : "";

    const [loading, setLoading] = useState(false);
    const [billType, setBillType] = useState<BillType>("normal");
    const [pkgHand, setPkgHand] = useState<HandPick>({ main: visit.nurse_id || "", asst: visit.assistant_id && visit.assistant_id !== visit.nurse_id ? visit.assistant_id : "" });
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    // Dispense tracking
    const [dispensedItems, setDispensedItems] = useState<string[]>([]);

    // Line items (editable)
    const [items, setItems] = useState<LineItem[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newItem, setNewItem] = useState<{ item_type: string; item_name: string; qty: string; unit_price: string }>({
        item_type: "service",
        item_name: "",
        qty: "1",
        unit_price: "",
    });

    // Billing
    const [discount, setDiscount] = useState<number>(0);
    const [discountReason, setDiscountReason] = useState("");
    // ออกใบเสร็จย้อนหลัง (เฉพาะ owner/admin) — ว่าง = วันนี้
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    const [billDate, setBillDate] = useState("");
    // แคมเปญ/โค้ดโปรฯ (ตรวจเงื่อนไขฝั่ง server)
    const [promoCode, setPromoCode] = useState("");
    const [promo, setPromo] = useState<ValidatedCampaign | null>(null);
    const [promoErr, setPromoErr] = useState("");
    const [promoChecking, setPromoChecking] = useState(false);
    const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);

    // Package picker (for selling new)
    const [showPackagePicker, setShowPackagePicker] = useState(false);
    const [packages, setPackages] = useState<ServicePackage[]>([]);

    // Drug picker (เพิ่มยาจากคลัง)
    const [showDrugPicker, setShowDrugPicker] = useState(false);
    const [drugSearch, setDrugSearch] = useState("");

    function addDrugItem(drug: InventoryDrug) {
        // เวชภัณฑ์ฉีด → item_type='injectable' (checkout ตัดผ่าน vial, ข้าม bulk deduct)
        const isInjectable = drug.deduction_type === "injectable_vial";
        setItems(prev => [...prev, {
            id: uid(),
            item_type: isInjectable ? "injectable" : (drug.category === "supply" ? "supply" : "drug"),
            item_ref_id: drug.id,
            label_source: "inventory",
            item_name: `${drug.item_name}${drug.strength ? ` ${drug.strength}` : ""}`,
            qty: 1,
            unit_price: Number(drug.sell_price),
            segment: isInjectable ? "aesthetic" : (drug.segment || "product"),
        }]);
        setShowDrugPicker(false);
        setDrugSearch("");
    }

    // Patient's active packages (for deducting sessions)
    const [activePackages, setActivePackages] = useState<PatientPackageActive[]>([]);
    const [usingPackageId, setUsingPackageId] = useState<string | null>(null);

    useEffect(() => {
        listActivePackages().then(setPackages);
        if (visit?.hn) {
            getPatientActivePackages(visit.hn).then(setActivePackages);
        }
    }, [visit?.hn]);

    async function handleUsePackage(pp: PatientPackageActive) {
        if (!confirm(`ตัด 1 ครั้งจาก "${pp.package_name}"?\nหลังตัดจะเหลือ ${pp.remaining_sessions - 1}/${pp.total_sessions} ครั้ง`)) return;
        setUsingPackageId(pp.id);
        const result = await consumePackageSession({
            patient_package_id: pp.id,
            visit_vn: visit.vn,
            hand_main_staff_id: pkgHand.main || null,
            hand_asst_staff_id: pkgHand.asst || null,
            note: "ตัดจากห้องยา/การเงิน",
        });
        setUsingPackageId(null);
        if (!result.success) {
            alert(result.error || "ตัดครั้งไม่สำเร็จ");
            return;
        }
        // Refresh active packages
        const updated = await getPatientActivePackages(visit.hn);
        setActivePackages(updated);
    }

    function addPackageItem(pkg: ServicePackage) {
        setItems(prev => [...prev, {
            id: uid(),
            item_type: "package",
            item_ref_id: pkg.id,
            item_name: `${pkg.name} (${pkg.total_sessions} ครั้ง)`,
            qty: 1,
            unit_price: Number(pkg.price),
            segment: "aesthetic",   // คอร์ส/แพ็กเกจ → ความงาม (ปรับได้)
            max_discount_pct: pkg.max_discount_pct ?? null,
        }]);
        setShowPackagePicker(false);
    }

    // Initial populate — auto-build items from drugs + labs (run ONCE only — ป้องกัน reset เมื่อ re-render)
    const initializedRef = useRef(false);
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const initialItems: LineItem[] = [];

        // ค่ายา (1 row ต่อตัว)
        drugOrders.forEach((d) => {
            const inv = Array.isArray(d.inventory) ? d.inventory[0] : d.inventory;
            const invName = inv?.item_name || d.item_name || "ยา";
            initialItems.push({
                id: uid(),
                item_type: "drug",
                item_ref_id: d.id,
                label_source: "order",
                item_name: invName,
                qty: Number(d.qty || 1),
                unit_price: Number(d.cost_per_unit || 0),
                segment: inv?.segment || "product",
            });
        });

        // ค่าแล็บ (1 row ต่อรายการ)
        (labOrders || []).forEach((l) => {
            initialItems.push({
                id: uid(),
                item_type: "lab",
                item_ref_id: l.id,
                item_name: l.lab_name || "Lab Test",
                qty: 1,
                unit_price: Number(l.price || 0),
                segment: "medical",
            });
        });

        // การฉีดที่หมอบันทึก (P06) → เด้งขึ้นบิลอัตโนมัติ (item_type='injectable' → ตัด vial)
        // qty = จำนวนจริง (ตัดสต๊อก) · block_price = ราคาก้อนที่หมอตั้ง (null → fallback ราคา/หน่วย×qty)
        (injections || []).forEach((inj) => {
            const q = Number(inj.qty || 1);
            const block = inj.sale_price != null
                ? Number(inj.sale_price)
                : (Number(inj.sell_price || 0) > 0 ? Number(inj.sell_price) * q : 0);
            initialItems.push({
                id: uid(),
                item_type: "injectable",
                item_ref_id: inj.item_id,
                item_name: `${inj.item_name}${inj.brand ? ` (${inj.brand})` : ""}${inj.site ? ` @ ${inj.site}` : ""}`,
                qty: q,
                unit_price: q > 0 ? block / q : 0,
                block_price: block,
                unit_label: inj.unit_label || undefined,
                segment: "aesthetic",
            });
        });

        setItems(initialItems);
    }, [drugOrders, labOrders, injections]);

    // Calculations
    const subtotal = useMemo(
        () => items.reduce((s, i) => s + lineGross(i), 0),
        [items]
    );
    // ส่วนลดรายรายการ (line discount) + แคมเปญ + ลดเองท้ายบิล
    const lineDiscountTotal = useMemo(
        () => items.reduce((s, i) => s + Math.min(Number(i.line_discount) || 0, lineGross(i)), 0),
        [items]
    );
    const promoDiscount = promo?.discount_amount || 0;
    const totalDiscount = Math.min(subtotal, lineDiscountTotal + promoDiscount + discount);
    const grandTotal = Math.max(0, subtotal - totalDiscount);

    // ตรวจโค้ดกับ server (เงื่อนไข/วันหมดอายุ/จำนวนครั้ง คำนวณฝั่ง server เท่านั้น)
    async function applyPromo() {
        const code = promoCode.trim();
        if (!code) return;
        setPromoChecking(true); setPromoErr("");
        try {
            const res = await validateCampaignCode({
                code, hn: visit.hn,
                items: items.map(i => ({ item_type: i.item_type, line_total: lineGross(i) - (Number(i.line_discount) || 0) })),
            });
            if (!res.ok) { setPromo(null); setPromoErr(res.error); return; }
            setPromo(res); setPromoErr("");
        } catch (e) {
            setPromoErr(e instanceof Error ? e.message : "ตรวจโค้ดไม่สำเร็จ");
        } finally {
            setPromoChecking(false);
        }
    }
    function clearPromo() { setPromo(null); setPromoCode(""); setPromoErr(""); }

    // รายการ/ส่วนลดเปลี่ยน → โค้ดที่ apply ไว้อาจไม่ตรงเงื่อนไขแล้ว ให้ตรวจใหม่
    useEffect(() => {
        if (promo) { setPromo(null); setPromoErr("รายการเปลี่ยน — กดใช้โค้ดอีกครั้ง"); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subtotal, lineDiscountTotal]);

    // เพดานส่วนลด (max_discount ต่อคอส) — คอสที่ตั้งเพดาน → ลดได้ไม่เกิน line × pct% · รายการอื่นไม่จำกัด
    const hasCappedPackage = useMemo(() => items.some(i => i.item_type === "package" && i.max_discount_pct != null), [items]);
    const discountCeiling = useMemo(
        () => items.reduce((s, i) => {
            const lineTotal = lineGross(i);
            const cap = i.item_type === "package" ? i.max_discount_pct : null;
            return s + (cap == null ? lineTotal : lineTotal * (cap / 100));
        }, 0),
        [items]
    );
    const overDiscountLimit = hasCappedPackage && totalDiscount > discountCeiling + 0.01;

    const currentPaymentDraft: PaymentDraft = paymentDraft || { mode: "full", deposit: "", rows: [{ method: "cash", amount: grandTotal.toFixed(2) }] };
    let payment: ReturnType<typeof paymentPlan> | undefined; let paymentError = "";
    try { payment = paymentPlan(Number(grandTotal.toFixed(2)), currentPaymentDraft); } catch (e) { paymentError = (e as Error).message; }
    const isPaymentValid = !!payment;
    const isReadyToComplete = true;

    const toggleDispense = (id: string) => {
        setDispensedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    function updateItem(id: string, field: "qty" | "unit_price" | "line_discount" | "block_price", value: string) {
        const num = parseFloat(value);
        setItems(prev =>
            prev.map(it => it.id === id ? { ...it, [field]: isNaN(num) ? 0 : Math.max(0, num) } : it)
        );
    }

    function removeItem(id: string) {
        setItems(prev => prev.filter(it => it.id !== id));
    }

    function handleAddItem() {
        if (!newItem.item_name.trim()) {
            toast.error("กรุณากรอกชื่อรายการ");
            return;
        }
        const qty = parseFloat(newItem.qty) || 1;
        const price = parseFloat(newItem.unit_price) || 0;
        setItems(prev => [...prev, {
            id: uid(),
            item_type: newItem.item_type,
            item_name: newItem.item_name.trim(),
            qty,
            unit_price: price,
        }]);
        setNewItem({ item_type: "service", item_name: "", qty: "1", unit_price: "" });
        setShowAddForm(false);
        setError("");
    }

    const handlePrintAllLabels = () => {
        const selected = items.filter(it => it.item_type === "drug" && it.qty > 0);
        if (selected.some(it => !it.label_source || !it.item_ref_id)) {
            toast.error("รายการยาที่กรอกเองไม่มีข้อมูลฉลาก กรุณาเลือกยาจากคลังผ่านปุ่มเพิ่มยา / เวชภัณฑ์");
            return;
        }
        const labels = selected.map(it => ({ source: it.label_source, id: it.item_ref_id, qty: it.qty }));
        const query = new URLSearchParams({ items: JSON.stringify(labels) });
        window.open(`/print/drug-labels/${encodeURIComponent(visit.vn)}?${query}`, "_blank", "noopener,noreferrer");
        setDispensedItems(drugOrders.map((d: DrugOrder) => d.id));
    };

    const handleComplete = async () => {
        if (loading || saved) return;
        if (!payment) {
            toast.error(paymentError || "กรุณาตรวจยอดรับเงิน");
            return;
        }
        if (items.length === 0) {
            toast.error("ไม่มีรายการในใบเสร็จ");
            return;
        }
        const sameHand = items.find(it => it.hand_main && it.hand_main === it.hand_asst);
        if (sameHand) {
            toast.error(`"${sameHand.item_name}": ผู้ปฏิบัติหลักกับผู้ช่วยต้องเป็นคนละคน`);
            return;
        }
        const unassigned = items.filter(it => DF_ELIGIBLE.has(it.item_type) && !it.performer);
        if (doctors.length > 0 && unassigned.length > 0) {
            toast.error(`กรุณาเลือก "แพทย์ผู้ทำ" ให้ครบ (${unassigned.length} รายการ) — ถ้าพยาบาลทำ ให้เลือก "ไม่ใช่แพทย์ทำ"`);
            return;
        }

        setLoading(true);
        setError("");

        try {
            const lines: InvoiceItemInput[] = items.map(it => {
                const gross = lineGross(it);
                const lineDisc = Math.min(Number(it.line_discount) || 0, gross);
                return {
                    item_type: it.item_type,
                    item_ref_id: it.item_ref_id,
                    item_name: it.item_name,
                    qty: it.qty,
                    // ของฉีด: unit_price = ราคาก้อน ÷ จำนวน (ให้ qty × unit_price = ยอดก้อน สำหรับบันทึก)
                    unit_price: it.qty > 0 ? gross / it.qty : it.unit_price,
                    // line_total = "ราคาเต็ม" เสมอ (ก่อนหักส่วนลด) — ส่วนลดเก็บแยกที่ discount_amount
                    // เพราะส่วนลดอาจมาจากแต้ม/กิฟต์วอยเชอร์ ซึ่งไม่ควรทำให้ฐานค่ามือลดลง
                    line_total: gross,
                    discount_amount: lineDisc,
                    segment: it.segment ?? null,
                    performer_staff_id: it.performer && it.performer !== NOT_DOCTOR ? it.performer : null,
                    hand_main_staff_id: HAND_ELIGIBLE.has(it.item_type) && it.hand_main ? it.hand_main : null,
                    hand_asst_staff_id: HAND_ELIGIBLE.has(it.item_type) && it.hand_asst ? it.hand_asst : null,
                };
            });

            // breakdown ส่วนลดทุกก้อน → invoice_discounts (foundation ของ report/audit)
            const discounts: DiscountEntry[] = [];
            items.forEach((it, idx) => {
                const lineDisc = Math.min(Number(it.line_discount) || 0, lineGross(it));
                if (lineDisc > 0) {
                    discounts.push({
                        inv_item_index: idx, discount_type: "manual",
                        discount_source: `ลดรายการ: ${it.item_name}`, amount: lineDisc,
                    });
                }
            });
            if (promo) {
                discounts.push({
                    inv_item_index: null, discount_type: "campaign",
                    discount_source: `${promo.code} · ${promo.name}`,
                    campaign_id: promo.campaign_id, amount: promo.discount_amount,
                });
            }
            if (discount > 0) {
                discounts.push({
                    inv_item_index: null, discount_type: "manual",
                    discount_source: discountReason.trim() || "ลดท้ายบิล (ไม่ระบุเหตุผล)",
                    amount: discount,
                });
            }

            const res = await completeCheckout({
                vn: visit.vn,
                items: lines,
                subtotal,
                discount: totalDiscount,
                total: Number(grandTotal.toFixed(2)),
                paid: payment.paid,
                payments: payment.payments,
                drugOrders,
                discounts,
                campaignId: promo?.campaign_id || null,
                campaignLabel: promo ? `${promo.code} · ${promo.name}` : null,
                billType,
                billDate: canBackdate && billDate && billDate !== todayStr ? billDate : undefined,
            });

            if (res.error) throw new Error(res.error);

            setSaved(true);
            toast.success("ปิดบิลสำเร็จ");
            // เปิดแท็บเดิม: ไม่พึ่ง pop-up หลัง await ซึ่งเบราว์เซอร์อาจบล็อก
            router.push(res.invId
                ? `/print/invoice/${encodeURIComponent(res.invId)}`
                : "/dashboard/finance");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            toast.error(e.message || "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-white/90 bg-white/85 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/pharmacy">
                        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 h-9 text-slate-600 hover:text-slate-800">
                            <ChevronLeft className="h-4 w-4" /> กลับ
                        </Button>
                    </Link>
                    <span className="text-slate-300">·</span>
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-semibold text-slate-800">{p?.prefix || ""}{p?.first_name} {p?.last_name}</span>
                            <Badge className="bg-rose-100 text-rose-700 border-0">{visit.status === "waiting_medicine" ? "รอจัดยา" : "รอชำระเงิน"}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                            <span className="font-mono">HN {visit.hn}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono">VN {visit.vn}</span>
                            {ptGender && <><span className="text-slate-300">·</span><span>{ptGender}</span></>}
                            {ptAge != null && <><span className="text-slate-300">·</span><span>อายุ {ptAge} ปี</span></>}
                            {p?.phone && <><span className="text-slate-300">·</span><span>โทร {p.phone}</span></>}
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {items.some(it => it.item_type === "drug" && it.qty > 0) && (
                        <Button onClick={handlePrintAllLabels} variant="outline" size="sm"
                            className="rounded-xl gap-1.5 h-9 border-slate-200 text-blue-700 hover:bg-blue-50">
                            <Pill className="h-4 w-4" /> พิมพ์ฉลากยา
                        </Button>
                    )}
                    <Link href={`/print/visits/${visit.vn}`} target="_blank">
                        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 border-blue-300 text-blue-700 hover:bg-blue-50">
                            <Printer className="h-4 w-4" /> พิมพ์ OPD Record
                        </Button>
                    </Link>
                </div>
            </div>

            {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">

                {/* ═══ LEFT: Items list ═══ */}
                <div className="min-w-0 space-y-5">
                    {/* (Pharmacy dispense section ถูกเอาออก — หมอไม่คีย์ยาที่ visit detail แล้ว
                        เคาท์เตอร์เพิ่มยาตอน checkout ผ่านปุ่ม "เพิ่มยา" ด้านล่าง) */}

                    {/* คอสคงเหลือของคนไข้ — กดตัดครั้งได้ */}
                    {activePackages.length > 0 && (
                        <div className="rounded-2xl border border-white/90 bg-white/90 backdrop-blur-xl shadow-sm overflow-hidden border-2 border-rose-200">
                            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-rose-200/60 bg-rose-50/60">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-rose-700" />
                                    <h2 className="text-sm font-semibold text-rose-900">คอสคงเหลือของคนไข้</h2>
                                    <span className="text-xs text-rose-700">({activePackages.length} คอส)</span>
                                </div>
                                <span className="text-xs text-rose-700/70 italic">ถ้าวันนี้ใช้คอส กดตัดครั้งได้เลย</span>
                            </div>
                            <div className="p-3 space-y-2">
                                {handStaff.length > 0 && <HandStaffPicker value={pkgHand} onChange={setPkgHand} staff={handStaff} />}
                                {activePackages.map(pp => (
                                    <div key={pp.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-slate-200">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-slate-800 text-sm truncate">{pp.package_name}</div>
                                            <div className="text-xs text-slate-500 inline-flex items-center gap-2">
                                                <span>ใช้ {pp.used_sessions}/{pp.total_sessions} ครั้ง · เหลือ <span className="font-semibold text-blue-700">{pp.remaining_sessions}</span></span>
                                                {pp.days_remaining <= 30 && (
                                                    <span className="text-amber-700 font-semibold">({pp.days_remaining} วันก่อนหมดอายุ)</span>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            disabled={usingPackageId === pp.id || pp.remaining_sessions <= 0}
                                            onClick={() => handleUsePackage(pp)}
                                            className="rounded-lg gap-1.5 h-9 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs shrink-0 disabled:opacity-50"
                                        >
                                            {usingPackageId === pp.id ? "กำลังตัด..." : "ตัด 1 ครั้ง"}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Editable Items List */}
                    <div className="rounded-2xl border border-white/90 bg-white/90 backdrop-blur-xl shadow-sm overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200/60 bg-blue-50/40">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-sm font-semibold text-blue-900">รายการในใบเสร็จ</h2>
                                <span className="text-xs text-blue-700">({items.length} รายการ)</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <Button
                                    size="sm"
                                    onClick={() => setShowDrugPicker(true)}
                                    variant="outline"
                                    className="rounded-lg gap-1.5 h-8 text-xs border-slate-200 text-blue-700 hover:bg-blue-50"
                                >
                                    <Pill className="h-3.5 w-3.5" /> เพิ่มยา / เวชภัณฑ์
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => setShowPackagePicker(true)}
                                    variant="outline"
                                    className="rounded-lg gap-1.5 h-8 text-xs border-slate-200 text-blue-700 hover:bg-blue-50"
                                >
                                    <Sparkles className="h-3.5 w-3.5" /> เพิ่มคอส
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => setShowAddForm(true)}
                                    className="rounded-lg gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    <Plus className="h-3.5 w-3.5" /> รายการอื่น
                                </Button>
                            </div>
                        </div>

                        {/* Add form */}
                        {showAddForm && (
                            <div className="px-5 py-3 bg-blue-50/30 border-b border-blue-100 space-y-2.5">
                                {/* Quick pick from preset */}
                                {services.length > 0 && (
                                    <div>
                                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">เลือกจากรายการบริการ (Preset) · เลือกแล้วเพิ่มทันที</label>
                                        <select
                                            value=""
                                            onChange={e => {
                                                const svc = services.find(s => s.id === e.target.value);
                                                if (svc) {
                                                    setItems(prev => [...prev, {
                                                        id: uid(),
                                                        item_type: svc.item_type,
                                                        item_ref_id: svc.id,
                                                        item_name: svc.service_name,
                                                        qty: 1,
                                                        unit_price: Number(svc.selling_price) || 0,
                                                        segment: svc.segment || "medical",
                                                    }]);
                                                    setError("");
                                                }
                                            }}
                                            className="h-9 w-full rounded-lg border border-blue-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                            <option value="">— เลือกเพื่อเพิ่มทันที ({services.length} รายการ) —</option>
                                            {services.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.service_code ? `[${s.service_code}] ` : ""}{s.service_name} — ฿{Number(s.selling_price).toLocaleString()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Manual form */}
                                <div>
                                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                                        {services.length > 0 ? "หรือกรอกเอง" : "รายละเอียดรายการ"}
                                    </label>
                                    <div className="grid grid-cols-12 gap-2">
                                        <select
                                            value={newItem.item_type}
                                            onChange={e => setNewItem(p => ({ ...p, item_type: e.target.value }))}
                                            className="col-span-3 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                            {Object.entries(ITEM_TYPE_LABEL).filter(([k]) => k !== "lab").map(([k, v]) => (
                                                <option key={k} value={k}>{v}</option>
                                            ))}
                                        </select>
                                        <Input
                                            placeholder="ชื่อรายการ"
                                            value={newItem.item_name}
                                            onChange={e => setNewItem(p => ({ ...p, item_name: e.target.value }))}
                                            className="col-span-5 h-9"
                                        />
                                        <Input
                                            type="number"
                                            placeholder="จำนวน"
                                            value={newItem.qty}
                                            onChange={e => setNewItem(p => ({ ...p, qty: e.target.value }))}
                                            className="col-span-1 h-9 text-right"
                                        />
                                        <Input
                                            type="number"
                                            placeholder="ราคา/หน่วย"
                                            value={newItem.unit_price}
                                            onChange={e => setNewItem(p => ({ ...p, unit_price: e.target.value }))}
                                            className="col-span-2 h-9 text-right"
                                        />
                                        <Button size="sm" onClick={handleAddItem} className="col-span-1 h-9 bg-blue-600 hover:bg-blue-700 text-white">
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <button onClick={() => setShowAddForm(false)} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
                                    <X className="h-3 w-3" /> ยกเลิก
                                </button>
                            </div>
                        )}

                        {doctors.length > 0 && items.some(it => DF_ELIGIBLE.has(it.item_type)) && (() => {
                            const visitDoc = doctors.find(d => d.id === visit.doctor_id);
                            const pending = items.filter(it => DF_ELIGIBLE.has(it.item_type) && !it.performer).length;
                            return (
                                <div className="mx-3 mb-2 flex items-center gap-2 flex-wrap rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2 text-xs">
                                    <span className="text-slate-600">แพทย์ผู้ทำ (คิด DF แพทย์):</span>
                                    {pending > 0 ? <span className="font-semibold text-amber-700">ยังไม่เลือก {pending} รายการ</span> : <span className="font-semibold text-emerald-700">ครบแล้ว ✓</span>}
                                    {visitDoc && (
                                        <button type="button" onClick={() => setItems(prev => prev.map(x => DF_ELIGIBLE.has(x.item_type) && !x.performer ? { ...x, performer: visitDoc.id } : x))}
                                            className="ml-auto h-7 px-2.5 rounded-md bg-blue-700 text-white font-semibold">ที่ยังว่าง = {visitDoc.name}</button>
                                    )}
                                </div>
                            );
                        })()}

                        {items.some(it => HAND_ELIGIBLE.has(it.item_type)) && handStaff.length > 0 && (() => {
                            const vNurse = handStaff.find(s => s.id === visit.nurse_id);
                            const vAsst = handStaff.find(s => s.id === visit.assistant_id);
                            const hint = BILL_TYPES.find(b => b.v === billType)?.hint;
                            return (
                                <div className="mx-3 mb-2 flex items-center gap-2 flex-wrap rounded-lg bg-emerald-50/60 border border-emerald-100 px-3 py-2 text-xs">
                                    <span className="text-slate-600">ประเภทบิล:</span>
                                    <div className="inline-flex rounded-md border border-slate-200 bg-white overflow-hidden">
                                        {BILL_TYPES.map(b => (
                                            <button key={b.v} type="button" onClick={() => setBillType(b.v)}
                                                className={`h-7 px-2.5 font-semibold ${billType === b.v ? (b.v === "normal" ? "bg-slate-700 text-white" : "bg-amber-500 text-white") : "text-slate-600 hover:bg-slate-50"}`}>{b.label}</button>
                                        ))}
                                    </div>
                                    {hint && <span className="text-amber-700">{hint}</span>}
                                    <span className="text-slate-500 ml-2">ค่ามือ: เลือกผู้ปฏิบัติหลัก/ผู้ช่วย ใต้แต่ละรายการ</span>
                                    {(vNurse || vAsst) && (
                                        <button type="button" onClick={() => setItems(prev => prev.map(x => {
                                            if (!HAND_ELIGIBLE.has(x.item_type)) return x;
                                            const main = x.hand_main || vNurse?.id || "";
                                            return { ...x, hand_main: main, hand_asst: x.hand_asst || (vAsst && vAsst.id !== main ? vAsst.id : "") };
                                        }))}
                                            className="ml-auto h-7 px-2.5 rounded-md bg-emerald-700 text-white font-semibold">
                                            ที่ยังว่าง = {[vNurse?.name, vAsst && `ผู้ช่วย ${vAsst.name}`].filter(Boolean).join(" · ")}
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60">
                                    <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        <th className="text-left px-3 py-2">ประเภท</th>
                                        <th className="text-left px-3 py-2">รายการ</th>
                                        <th className="text-right px-3 py-2 w-20">จำนวน</th>
                                        <th className="text-right px-3 py-2 w-28">ราคา/หน่วย</th>
                                        <th className="text-right px-3 py-2 w-24">ลดรายการ</th>
                                        <th className="text-right px-3 py-2 w-28">รวม</th>
                                        <th className="w-10 px-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.length === 0 ? (
                                        <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">ยังไม่มีรายการ — กด &quot;เพิ่มรายการ&quot;</td></tr>
                                    ) : items.map(it => {
                                        // ยา + แล็บ: หมอเป็นคนสั่ง — ห้ามแก้ qty/ราคา (ลบได้)
                                        // เคาท์เตอร์เป็นคนคีย์ทุกรายการ — แก้ไขได้ทุกฟิลด์
                                        const fieldsLocked = false;
                                        return (
                                        <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                                            <td className="px-3 py-2">
                                                <span className={`text-xs px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${ITEM_TYPE_COLOR[it.item_type] || ITEM_TYPE_COLOR.other}`}>
                                                    {ITEM_TYPE_LABEL[it.item_type] || it.item_type}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-800 font-medium">
                                                {it.item_name}
                                                {fieldsLocked && <span className="ml-1.5 text-xs text-slate-500 font-normal" title="หมอเป็นคนสั่ง — ราคา/จำนวนจากระบบ"></span>}
                                                {DF_ELIGIBLE.has(it.item_type) && doctors.length > 0 && (
                                                    <select aria-label="แพทย์ผู้ทำ" value={it.performer || ""} onChange={e => setItems(prev => prev.map(x => x.id === it.id ? { ...x, performer: e.target.value } : x))}
                                                        className={`mt-1 block w-full max-w-[220px] h-7 rounded-md border bg-white px-1.5 text-xs font-normal ${it.performer ? "border-slate-200 text-slate-700" : "border-amber-400 text-amber-700"}`}>
                                                        <option value="">— แพทย์ผู้ทำ? —</option>
                                                        {doctors.map(d => <option key={d.id} value={d.id}>👨‍⚕️ {d.name}</option>)}
                                                        <option value={NOT_DOCTOR}>ไม่ใช่แพทย์ทำ (พยาบาล/อื่นๆ)</option>
                                                    </select>
                                                )}
                                                {HAND_ELIGIBLE.has(it.item_type) && handStaff.length > 0 && (
                                                    <div className="mt-1 flex gap-1 flex-wrap">
                                                        <select aria-label="ผู้ปฏิบัติหลัก" value={it.hand_main || ""} onChange={e => setItems(prev => prev.map(x => x.id === it.id ? { ...x, hand_main: e.target.value } : x))}
                                                            className={`h-7 max-w-[170px] rounded-md border bg-white px-1.5 text-xs font-normal ${it.hand_main ? "border-emerald-300 text-emerald-800" : "border-slate-200 text-slate-400"}`}>
                                                            <option value="">ผู้ปฏิบัติหลัก —</option>
                                                            {handStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                        </select>
                                                        <select aria-label="ผู้ช่วย" value={it.hand_asst || ""} onChange={e => setItems(prev => prev.map(x => x.id === it.id ? { ...x, hand_asst: e.target.value } : x))}
                                                            className={`h-7 max-w-[150px] rounded-md border bg-white px-1.5 text-xs font-normal ${it.hand_asst ? "border-emerald-300 text-emerald-800" : "border-slate-200 text-slate-400"}`}>
                                                            <option value="">ผู้ช่วย —</option>
                                                            {handStaff.filter(s => s.id !== it.hand_main).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-1 py-1">
                                                {fieldsLocked ? (
                                                    <div className="h-8 px-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-end text-sm font-semibold text-slate-700 tabular-nums">
                                                        {it.qty}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={it.qty}
                                                            onChange={e => updateItem(it.id, "qty", e.target.value)}
                                                            className="h-8 text-right text-sm tabular-nums"
                                                        />
                                                        {it.item_type === "injectable" && it.unit_label && (
                                                            <span className="text-xs text-slate-500 shrink-0">{it.unit_label}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-1 py-1">
                                                {it.item_type === "injectable" ? (
                                                    // ของฉีดขายเป็น "ก้อน" — แก้ราคาก้อนตรงๆ (ไม่ใช่ต่อหน่วย)
                                                    <div className="relative">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={it.block_price ?? 0}
                                                            onChange={e => updateItem(it.id, "block_price", e.target.value)}
                                                            title="ราคาขายก้อน (รวม) — ไม่ใช่ราคาต่อหน่วย"
                                                            className="h-8 text-right text-sm tabular-nums font-semibold text-violet-700"
                                                        />
                                                        <span className="pointer-events-none absolute -bottom-3 right-0 text-xs text-violet-400">ก้อน</span>
                                                    </div>
                                                ) : fieldsLocked ? (
                                                    <div className="h-8 px-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-end text-sm font-semibold text-slate-700 tabular-nums">
                                                        ฿{it.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                ) : (
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={it.unit_price}
                                                        onChange={e => updateItem(it.id, "unit_price", e.target.value)}
                                                        className="h-8 text-right text-sm tabular-nums"
                                                    />
                                                )}
                                            </td>
                                            <td className="px-1 py-1">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="0"
                                                    value={it.line_discount || ""}
                                                    onChange={e => updateItem(it.id, "line_discount", e.target.value)}
                                                    title="ลดเฉพาะรายการนี้ เช่น แถมยาฟรี"
                                                    className="h-8 text-right text-sm tabular-nums text-red-600"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold text-slate-800 tabular-nums">
                                                {(Number(it.line_discount) || 0) > 0 && (
                                                    <div className="text-xs font-normal text-slate-500 line-through">
                                                        ฿{lineGross(it).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                )}
                                                ฿{Math.max(0, lineGross(it) - (Number(it.line_discount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-1 py-2 text-center">
                                                <button
                                                    onClick={() => removeItem(it.id)}
                                                    className="h-7 w-7 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors inline-flex items-center justify-center"
                                                    title={fieldsLocked ? "ลบรายการ (เช่น คนไข้ไม่รับยาตัวนี้)" : "ลบรายการ"}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Appointment (counter เป็นคนนัด) */}
                    <CheckoutAppointmentForm vn={visit.vn} hn={visit.hn} />
                </div>

                {/* ═══ RIGHT: Billing summary + Payment ═══ */}
                <div className="min-w-0 space-y-4">
                    <div className="rounded-2xl border border-white/90 bg-white/90 backdrop-blur-xl shadow-sm p-5 space-y-4">
                        {/* Bill summary */}
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-slate-600">
                                <span>ยอดรวม (Subtotal)</span>
                                <span className="font-semibold tabular-nums">฿{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            {/* ส่วนลดรายรายการ (รวมจากตาราง) */}
                            {lineDiscountTotal > 0 && (
                                <div className="flex justify-between text-red-600">
                                    <span>ส่วนลดรายรายการ</span>
                                    <span className="font-semibold tabular-nums">−฿{lineDiscountTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            {/* โค้ดโปรโมชัน */}
                            <div className="space-y-1.5">
                                {promo ? (
                                    <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                                        <div className="min-w-0">
                                            <div className="text-xs font-semibold text-emerald-800 truncate">{promo.code} · {promo.name}</div>
                                            <div className="text-xs text-emerald-700">ใช้กับยอด ฿{promo.eligible_base.toLocaleString()}</div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="font-semibold text-emerald-700 tabular-nums text-sm">−฿{promo.discount_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            <button onClick={clearPromo} title="เอาโค้ดออก" className="text-slate-500 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Input
                                            value={promoCode}
                                            onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoErr(""); }}
                                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }}
                                            placeholder="โค้ดโปรโมชัน"
                                            className="h-9 text-sm font-mono uppercase"
                                        />
                                        <Button type="button" size="sm" variant="outline" disabled={promoChecking || !promoCode.trim()}
                                            onClick={applyPromo} className="h-9 shrink-0">
                                            {promoChecking ? "..." : "ใช้โค้ด"}
                                        </Button>
                                    </div>
                                )}
                                {promoErr && <div className="text-xs text-red-600">{promoErr}</div>}
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <Label className="text-slate-600 whitespace-nowrap">ลดเองท้ายบิล</Label>
                                <div className="relative w-32">
                                    <Input
                                        type="number"
                                        min="0"
                                        value={discount || ""}
                                        onChange={e => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                                        className="pl-7 h-9 text-right text-red-600 font-semibold tabular-nums"
                                    />
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">฿</span>
                                </div>
                            </div>
                            {discount > 0 && (
                                <Input
                                    value={discountReason}
                                    onChange={e => setDiscountReason(e.target.value)}
                                    placeholder="เหตุผลที่ลด (บันทึกไว้ตรวจสอบ)"
                                    className="h-8 text-xs"
                                />
                            )}

                            {totalDiscount > 0 && (
                                <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 text-red-600 font-semibold">
                                    <span>ส่วนลดรวม</span>
                                    <span className="tabular-nums">−฿{totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            {/* เตือนเมื่อส่วนลดเกินเพดาน max_discount ต่อคอส (ไม่บล็อก — flag ขออนุมัติ) */}
                            {overDiscountLimit && (
                                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>ส่วนลดเกินเพดานของคอส (ลดได้สูงสุด ฿{discountCeiling.toLocaleString(undefined, { maximumFractionDigits: 0 })}) — ชำระได้ปกติ แต่จะถูกส่งขออนุมัติเป็นกรณี “เกินเพดาน”</span>
                                </div>
                            )}
                        </div>

                        {/* Grand total */}
                        <div className="pt-4 border-t-2 border-dashed border-slate-200 flex items-end justify-between">
                            <span className="text-sm font-semibold text-slate-700">ยอดสุทธิ</span>
                            <span className="text-3xl font-semibold text-emerald-600 tracking-tight tabular-nums">
                                ฿{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        {/* ออกใบเสร็จย้อนหลัง (เฉพาะ owner/admin) */}
                        {canBackdate && (
                            <div className="pt-3 border-t border-slate-200/60 space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                    วันที่บนใบเสร็จ (ออกย้อนหลัง)
                                    {billDate && billDate !== todayStr && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">ย้อนหลัง</span>}
                                </Label>
                                <Input type="date" value={billDate} max={todayStr} onChange={e => setBillDate(e.target.value)} className="h-9" />
                                <p className="text-xs text-slate-500">
                                    ว่าง = วันนี้ · การเงิน/ปิดยอด/สต๊อก ยังนับที่<b>วันนี้</b>เสมอ (แค่วันที่บนกระดาษย้อนหลัง) · บันทึก audit ทุกครั้ง
                                </p>
                            </div>
                        )}

                        <PaymentEditor total={Number(grandTotal.toFixed(2))} draft={currentPaymentDraft} onChange={setPaymentDraft} disabled={loading || saved} />

                        {/* Action */}
                        <Button
                            className="w-full min-h-12 h-auto py-3 whitespace-normal leading-relaxed rounded-xl text-base font-semibold gap-2 bg-blue-700 hover:bg-blue-800 text-white shadow-lg shadow-blue-500/25"
                            onClick={handleComplete}
                            disabled={loading || saved || !isReadyToComplete || !isPaymentValid || items.length === 0}
                        >
                            {loading ? <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> :
                                saved ? <CheckCircle2 className="h-5 w-5" /> :
                                    <Printer className="h-5 w-5" />}
                            {saved ? "สำเร็จ!" :
                                items.length === 0 ? "ไม่มีรายการ" :
                                !isPaymentValid ? "ยอดเงินไม่พอ" :
                                    "รับเงินและออกใบเสร็จ"}
                        </Button>
                        <p className="text-center text-xs text-slate-500">
                            ระบบจะอัปเดตสถานะเป็น &quot;เสร็จสิ้น&quot; + ตัดสต๊อกยา + บันทึกใบเสร็จรับเงิน + payment log
                        </p>
                    </div>
                </div>
            </div>

            {/* Drug picker modal */}
            {showDrugPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <div>
                                <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                                    <Pill className="h-5 w-5 text-amber-600" />
                                    เพิ่มยา / เวชภัณฑ์
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">เลือกจากคลัง — เพิ่มเป็นรายการในใบเสร็จ</p>
                            </div>
                            <button onClick={() => { setShowDrugPicker(false); setDrugSearch(""); }} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                                <X className="h-4 w-4 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-5 border-b border-slate-100">
                            <Input
                                type="search"
                                placeholder="ค้นหาชื่อยา / เวชภัณฑ์ / ชื่อสามัญ..."
                                value={drugSearch}
                                onChange={e => setDrugSearch(e.target.value)}
                                className="rounded-xl"
                                autoFocus
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            {inventoryDrugs.length === 0 ? (
                                <div className="p-8 text-center text-slate-500 text-sm">
                                    ไม่มียาในคลัง — <Link href="/dashboard/inventory/new" className="text-blue-600 font-semibold underline">เพิ่มยา</Link>
                                </div>
                            ) : (() => {
                                const q = drugSearch.toLowerCase().trim();
                                const filtered = q
                                    ? inventoryDrugs.filter(d =>
                                        d.item_name.toLowerCase().includes(q) ||
                                        (d.generic_name || "").toLowerCase().includes(q)
                                    )
                                    : inventoryDrugs;
                                if (filtered.length === 0) {
                                    return <div className="p-8 text-center text-slate-500 text-sm">ไม่พบยาที่ค้นหา</div>;
                                }
                                return (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {filtered.map(d => (
                                            <button
                                                key={d.id}
                                                type="button"
                                                onClick={() => addDrugItem(d)}
                                                className="text-left p-3 rounded-xl border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 transition-all"
                                            >
                                                                <div className="flex items-center gap-1.5 mb-1">
                                                    {d.category === "supply" ? (
                                                        <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold uppercase">เวชภัณฑ์</span>
                                                    ) : (
                                                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold uppercase">ยา</span>
                                                    )}
                                                </div>
                                                <div className="font-semibold text-slate-800 text-sm">
                                                    {d.item_name}
                                                    {d.strength && <span className="text-slate-500 font-normal ml-1">{d.strength}</span>}
                                                </div>
                                                {d.generic_name && <div className="text-xs text-slate-500">{d.generic_name}</div>}
                                                <div className="flex items-center justify-between mt-1.5 text-xs">
                                                    <span className="text-slate-500">คงเหลือ <span className={`font-semibold ${d.stock_qty > 0 ? "text-slate-700" : "text-red-600"}`}>{d.stock_qty}</span> {d.unit}</span>
                                                    <span className="font-semibold text-amber-700 tabular-nums">฿{Number(d.sell_price).toLocaleString()}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Package picker modal */}
            {showPackagePicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <div>
                                <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-rose-500" />
                                    เลือกคอสบริการ
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">เพิ่มเข้าใบเสร็จเป็นรายการ — ระบบจะบันทึกสิทธิ์ให้คนไข้อัตโนมัติ</p>
                            </div>
                            <button onClick={() => setShowPackagePicker(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                                <X className="h-4 w-4 text-slate-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5">
                            {packages.length === 0 ? (
                                <div className="p-8 text-center text-slate-500 text-sm">
                                    ไม่มีคอสในระบบ — <Link href="/dashboard/inventory/packages" className="text-blue-600 font-semibold underline">เพิ่มคอสใหม่</Link>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {packages.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => addPackageItem(p)}
                                            className="text-left p-3 rounded-xl border-2 border-slate-200 hover:border-rose-400 hover:bg-rose-50/30 transition-all"
                                        >
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{p.code}</span>
                                                {p.category && (
                                                    <Badge className="border-0 bg-rose-100 text-rose-700 text-xs font-semibold uppercase">{p.category}</Badge>
                                                )}
                                            </div>
                                            <div className="font-semibold text-slate-800 text-sm line-clamp-1">{p.name}</div>
                                            <div className="flex items-center justify-between mt-1 text-xs">
                                                <span className="text-slate-500">{p.total_sessions} ครั้ง · {p.validity_days}d</span>
                                                <span className="font-semibold text-blue-700 tabular-nums">฿{Number(p.price).toLocaleString()}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
