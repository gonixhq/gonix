"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Printer, CheckCircle2, ChevronLeft, CreditCard, Banknote, QrCode,
    Pill, Plus, Trash2, X, AlertCircle, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { completeCheckout, type InvoiceItemInput } from "./checkout-actions";
import type { ServiceCatalogItem } from "@/lib/service-types";
import { listActivePackages, getPatientActivePackages, usePackageSession } from "@/lib/actions/packages";
import type { ServicePackage, PatientPackageActive } from "@/lib/package-types";
import CheckoutAppointmentForm from "./checkout-appointment-form";

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
    package: "bg-rose-100 text-rose-700",
    other: "bg-slate-100 text-slate-700",
};

interface LineItem {
    id: string;             // local UI id
    item_type: string;      // doctor_fee, drug, lab, ...
    item_ref_id?: string;   // reference to drug_order.id / lab_order.id (optional)
    item_name: string;
    qty: number;
    unit_price: number;
    locked?: boolean;       // ลบไม่ได้ (เช่น ค่าตรวจ)
}

let uidCounter = 0;
const uid = () => `item-${Date.now()}-${++uidCounter}`;

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
}

export default function CheckoutForm({
    visit,
    drugOrders,
    labOrders,
    services = [],
    inventoryDrugs = [],
}: {
    visit: Visit;
    drugOrders: DrugOrder[];
    labOrders: LabOrder[];
    services?: ServiceCatalogItem[];
    inventoryDrugs?: InventoryDrug[];
}) {
    const router = useRouter();
    const p = Array.isArray(visit.patients) ? visit.patients[0] : (visit.patients || visit.patient);
    const ptAge = p?.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : null;
    const ptGender = p?.gender === "M" ? "ชาย" : p?.gender === "F" ? "หญิง" : "";

    const [loading, setLoading] = useState(false);
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
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "credit">("cash");
    const [amountReceived, setAmountReceived] = useState<string>("0");

    // Package picker (for selling new)
    const [showPackagePicker, setShowPackagePicker] = useState(false);
    const [packages, setPackages] = useState<ServicePackage[]>([]);

    // Drug picker (เพิ่มยาจากคลัง)
    const [showDrugPicker, setShowDrugPicker] = useState(false);
    const [drugSearch, setDrugSearch] = useState("");

    function addDrugItem(drug: InventoryDrug) {
        setItems(prev => [...prev, {
            id: uid(),
            item_type: drug.category === "supply" ? "supply" : "drug",
            item_ref_id: drug.id,
            item_name: `${drug.item_name}${drug.strength ? ` ${drug.strength}` : ""}`,
            qty: 1,
            unit_price: Number(drug.sell_price),
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
        const result = await usePackageSession({
            patient_package_id: pp.id,
            visit_vn: visit.vn,
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
            const invName = (Array.isArray(d.inventory) ? d.inventory[0]?.item_name : d.inventory?.item_name) || d.item_name || "ยา";
            initialItems.push({
                id: uid(),
                item_type: "drug",
                item_ref_id: d.id,
                item_name: invName,
                qty: Number(d.qty || 1),
                unit_price: Number(d.cost_per_unit || 0),
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
            });
        });

        setItems(initialItems);
    }, [drugOrders, labOrders]);

    // Calculations
    const subtotal = useMemo(
        () => items.reduce((s, i) => s + (i.qty * i.unit_price), 0),
        [items]
    );
    const grandTotal = Math.max(0, subtotal - discount);

    // Auto-fill received amount = total เมื่อ grandTotal เปลี่ยน (ถ้ายังไม่ได้แก้)
    const receivedTouchedRef = useRef(false);
    useEffect(() => {
        if (!receivedTouchedRef.current) {
            setAmountReceived(grandTotal.toString());
        }
    }, [grandTotal]);

    const received = parseFloat(amountReceived) || 0;
    const change = received >= grandTotal ? received - grandTotal : 0;
    const outstanding = received < grandTotal ? grandTotal - received : 0;
    const isDeposit = received > 0 && received < grandTotal;

    // Removed dispensing checklist — counter manages drug items directly via "เพิ่มยา"
    const isReadyToComplete = true;
    // Allow any amount (including 0 for ค้างชำระเต็ม) — counter judges
    const isPaymentValid = received >= 0;

    const toggleDispense = (id: string) => {
        setDispensedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    function updateItem(id: string, field: "qty" | "unit_price", value: string) {
        const num = parseFloat(value);
        setItems(prev =>
            prev.map(it => it.id === id ? { ...it, [field]: isNaN(num) ? 0 : num } : it)
        );
    }

    function removeItem(id: string) {
        setItems(prev => prev.filter(it => it.id !== id));
    }

    function handleAddItem() {
        if (!newItem.item_name.trim()) {
            setError("กรุณากรอกชื่อรายการ");
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
        window.open(`/print/drug-labels/${visit.vn}`, "_blank");
        setDispensedItems(drugOrders.map((d: DrugOrder) => d.id));
    };

    const handleComplete = async () => {
        if (!isPaymentValid) {
            setError("ยอดเงินรับน้อยกว่ายอดสุทธิ");
            return;
        }
        if (items.length === 0) {
            setError("ไม่มีรายการในใบเสร็จ");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const lines: InvoiceItemInput[] = items.map(it => ({
                item_type: it.item_type,
                item_ref_id: it.item_ref_id,
                item_name: it.item_name,
                qty: it.qty,
                unit_price: it.unit_price,
                line_total: it.qty * it.unit_price,
            }));

            const res = await completeCheckout({
                vn: visit.vn,
                items: lines,
                subtotal,
                discount,
                total: grandTotal,
                paid: Math.min(received, grandTotal),  // จ่ายตามที่รับมา (cap ที่ total)
                paymentMethod,
                drugOrders,
            });

            if (res.error) throw new Error(res.error);

            setSaved(true);
            // เปิดหน้าพิมพ์ใบเสร็จรับเงินในแท็บใหม่
            if (res.invId) {
                window.open(`/print/invoice/${res.invId}`, "_blank");
            }
            setTimeout(() => {
                router.push("/dashboard/pharmacy");
                router.refresh();
            }, 1500);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            setError(e.message || "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/pharmacy">
                        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 h-9 text-slate-600 hover:text-slate-800">
                            <ChevronLeft className="h-4 w-4" /> กลับ
                        </Button>
                    </Link>
                    <span className="text-slate-300">·</span>
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-slate-800">{p?.prefix || ""}{p?.first_name} {p?.last_name}</span>
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
                <div className="flex items-center gap-2">
                    {drugOrders.length > 0 && (
                        <Button onClick={handlePrintAllLabels} variant="outline" size="sm"
                            className="rounded-xl gap-1.5 h-9 border-amber-300 text-amber-700 hover:bg-amber-50">
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

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-5 items-start">

                {/* ═══ LEFT: Items list ═══ */}
                <div className="space-y-5">
                    {/* (Pharmacy dispense section ถูกเอาออก — หมอไม่คีย์ยาที่ visit detail แล้ว
                        เคาท์เตอร์เพิ่มยาตอน checkout ผ่านปุ่ม "เพิ่มยา" ด้านล่าง) */}

                    {/* คอสคงเหลือของคนไข้ — กดตัดครั้งได้ */}
                    {activePackages.length > 0 && (
                        <div className="gonix-card-premium overflow-hidden border-2 border-rose-200">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-rose-200/60 bg-rose-50/60">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-rose-700" />
                                    <h2 className="text-sm font-bold text-rose-900">คอสคงเหลือของคนไข้</h2>
                                    <span className="text-xs text-rose-700">({activePackages.length} คอส)</span>
                                </div>
                                <span className="text-[11px] text-rose-700/70 italic">ถ้าวันนี้ใช้คอส กดตัดครั้งได้เลย</span>
                            </div>
                            <div className="p-3 space-y-2">
                                {activePackages.map(pp => (
                                    <div key={pp.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-slate-200">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-slate-800 text-sm truncate">{pp.package_name}</div>
                                            <div className="text-[11px] text-slate-500 inline-flex items-center gap-2">
                                                <span>ใช้ {pp.used_sessions}/{pp.total_sessions} ครั้ง · เหลือ <span className="font-bold text-blue-700">{pp.remaining_sessions}</span></span>
                                                {pp.days_remaining <= 30 && (
                                                    <span className="text-amber-700 font-bold">({pp.days_remaining} วันก่อนหมดอายุ)</span>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            disabled={usingPackageId === pp.id || pp.remaining_sessions <= 0}
                                            onClick={() => handleUsePackage(pp)}
                                            className="rounded-lg gap-1.5 h-9 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold text-xs shrink-0 disabled:opacity-50"
                                        >
                                            {usingPackageId === pp.id ? "กำลังตัด..." : "ตัด 1 ครั้ง"}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Editable Items List */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/60 bg-blue-50/40">
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-bold text-blue-900">รายการในใบเสร็จ</h2>
                                <span className="text-xs text-blue-700">({items.length} รายการ)</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <Button
                                    size="sm"
                                    onClick={() => setShowDrugPicker(true)}
                                    variant="outline"
                                    className="rounded-lg gap-1.5 h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                                >
                                    <Pill className="h-3.5 w-3.5" /> เพิ่มยา / เวชภัณฑ์
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => setShowPackagePicker(true)}
                                    variant="outline"
                                    className="rounded-lg gap-1.5 h-8 text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
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
                                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">เลือกจากรายการบริการ (Preset) · เลือกแล้วเพิ่มทันที</label>
                                        <select
                                            value=""
                                            onChange={e => {
                                                const svc = services.find(s => s.id === e.target.value);
                                                if (svc) {
                                                    setItems(prev => [...prev, {
                                                        id: uid(),
                                                        item_type: svc.item_type,
                                                        item_name: svc.service_name,
                                                        qty: 1,
                                                        unit_price: Number(svc.selling_price) || 0,
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
                                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
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

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60">
                                    <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <th className="text-left px-3 py-2">ประเภท</th>
                                        <th className="text-left px-3 py-2">รายการ</th>
                                        <th className="text-right px-3 py-2 w-20">จำนวน</th>
                                        <th className="text-right px-3 py-2 w-28">ราคา/หน่วย</th>
                                        <th className="text-right px-3 py-2 w-28">รวม</th>
                                        <th className="w-10 px-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.length === 0 ? (
                                        <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">ยังไม่มีรายการ — กด &quot;เพิ่มรายการ&quot;</td></tr>
                                    ) : items.map(it => {
                                        // ยา + แล็บ: หมอเป็นคนสั่ง — ห้ามแก้ qty/ราคา (ลบได้)
                                        // เคาท์เตอร์เป็นคนคีย์ทุกรายการ — แก้ไขได้ทุกฟิลด์
                                        const fieldsLocked = false;
                                        return (
                                        <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                                            <td className="px-3 py-2">
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${ITEM_TYPE_COLOR[it.item_type] || ITEM_TYPE_COLOR.other}`}>
                                                    {ITEM_TYPE_LABEL[it.item_type] || it.item_type}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-800 font-medium">
                                                {it.item_name}
                                                {fieldsLocked && <span className="ml-1.5 text-[10px] text-slate-400 font-normal" title="หมอเป็นคนสั่ง — ราคา/จำนวนจากระบบ">🔒</span>}
                                            </td>
                                            <td className="px-1 py-1">
                                                {fieldsLocked ? (
                                                    <div className="h-8 px-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-end text-sm font-semibold text-slate-700 tabular-nums">
                                                        {it.qty}
                                                    </div>
                                                ) : (
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={it.qty}
                                                        onChange={e => updateItem(it.id, "qty", e.target.value)}
                                                        className="h-8 text-right text-sm tabular-nums"
                                                    />
                                                )}
                                            </td>
                                            <td className="px-1 py-1">
                                                {fieldsLocked ? (
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
                                            <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">
                                                ฿{(it.qty * it.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-1 py-2 text-center">
                                                <button
                                                    onClick={() => removeItem(it.id)}
                                                    className="h-7 w-7 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors inline-flex items-center justify-center"
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
                <div className="lg:sticky lg:top-4 space-y-4">
                    <div className="gonix-card-premium p-5 space-y-4">
                        {/* Bill summary */}
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-slate-600">
                                <span>ยอดรวม (Subtotal)</span>
                                <span className="font-semibold tabular-nums">฿{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <Label className="text-slate-600 whitespace-nowrap">ส่วนลด</Label>
                                <div className="relative w-32">
                                    <Input
                                        type="number"
                                        min="0"
                                        value={discount || ""}
                                        onChange={e => setDiscount(Number(e.target.value) || 0)}
                                        className="pl-7 h-9 text-right text-red-600 font-semibold tabular-nums"
                                    />
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">฿</span>
                                </div>
                            </div>
                        </div>

                        {/* Grand total */}
                        <div className="pt-4 border-t-2 border-dashed border-slate-200 flex items-end justify-between">
                            <span className="text-sm font-bold text-slate-700">ยอดสุทธิ</span>
                            <span className="text-3xl font-black text-emerald-600 tracking-tight tabular-nums">
                                ฿{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        {/* Payment method */}
                        <div className="pt-3 border-t border-slate-200/60 space-y-2">
                            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">ช่องทางชำระ</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { v: "cash" as const, l: "เงินสด", icon: Banknote, color: "emerald" },
                                    { v: "transfer" as const, l: "QR / โอน", icon: QrCode, color: "sky" },
                                    { v: "credit" as const, l: "บัตรเครดิต", icon: CreditCard, color: "slate" },
                                ]).map(opt => {
                                    const Icon = opt.icon;
                                    const active = paymentMethod === opt.v;
                                    return (
                                        <button
                                            key={opt.v}
                                            type="button"
                                            onClick={() => { setPaymentMethod(opt.v); setAmountReceived(grandTotal.toString()); }}
                                            className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-xs font-bold ${
                                                active
                                                    ? opt.color === "emerald" ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/30"
                                                    : opt.color === "sky" ? "bg-cyan-600 text-white shadow-md shadow-cyan-500/30"
                                                    : "bg-slate-800 text-white shadow-md shadow-slate-700/30"
                                                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                                            }`}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {opt.l}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Cash/Payment calculator */}
                        <div className="pt-3 border-t border-slate-200/60 space-y-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-600">รับเงินมา</Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={amountReceived}
                                            onChange={(e) => { receivedTouchedRef.current = true; setAmountReceived(e.target.value); }}
                                            className="pl-7 text-base font-bold h-11 rounded-xl tabular-nums"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">฿</span>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-600">
                                        {isDeposit ? "ค้างชำระ" : "เงินทอน"}
                                    </Label>
                                    <div className={`h-11 rounded-xl border px-3 flex items-center justify-end text-base font-bold tabular-nums ${
                                        isDeposit
                                            ? "bg-amber-50 border-amber-300 text-amber-800"
                                            : change > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-800"
                                    }`}>
                                        ฿{(isDeposit ? outstanding : change).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>

                            {/* Quick deposit presets */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                <span className="text-[11px] text-slate-500 font-medium">ลัด:</span>
                                <button type="button" onClick={() => { receivedTouchedRef.current = true; setAmountReceived(grandTotal.toString()); }}
                                    className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium">เต็มจำนวน</button>
                                <button type="button" onClick={() => { receivedTouchedRef.current = true; setAmountReceived((grandTotal * 0.5).toString()); }}
                                    className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">มัดจำ 50%</button>
                                <button type="button" onClick={() => { receivedTouchedRef.current = true; setAmountReceived((grandTotal * 0.3).toString()); }}
                                    className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">มัดจำ 30%</button>
                                <button type="button" onClick={() => { receivedTouchedRef.current = true; setAmountReceived("0"); }}
                                    className="text-[11px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 font-medium">ค้างทั้งหมด</button>
                            </div>

                            {isDeposit && (
                                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                                    <span className="text-base leading-none">⚠</span>
                                    <span><strong>มัดจำ</strong> — ค้างชำระ <strong>฿{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> · ใบเสร็จจะมี status <strong>&ldquo;ค้างชำระ&rdquo;</strong> รับเพิ่มได้ที่หน้าการเงิน</span>
                                </div>
                            )}
                            {received === 0 && grandTotal > 0 && (
                                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                                    ค้างชำระเต็มจำนวน — สามารถรับเงินภายหลังที่หน้าใบเสร็จ
                                </div>
                            )}
                        </div>

                        {/* Action */}
                        <Button
                            className="w-full h-12 rounded-xl text-base font-bold gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/25"
                            onClick={handleComplete}
                            disabled={loading || !isReadyToComplete || !isPaymentValid || items.length === 0}
                        >
                            {loading ? <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> :
                                saved ? <CheckCircle2 className="h-5 w-5" /> :
                                    <Printer className="h-5 w-5" />}
                            {saved ? "สำเร็จ!" :
                                items.length === 0 ? "ไม่มีรายการ" :
                                !isPaymentValid ? "ยอดเงินไม่พอ" :
                                    "พิมพ์ใบเสร็จรับเงิน & เสร็จสิ้น"}
                        </Button>
                        <p className="text-center text-[11px] text-slate-400">
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
                                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
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
                                    ไม่มียาในคลัง — <Link href="/dashboard/inventory/new" className="text-blue-600 font-bold underline">เพิ่มยา</Link>
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
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold uppercase">เวชภัณฑ์</span>
                                                    ) : (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold uppercase">ยา</span>
                                                    )}
                                                </div>
                                                <div className="font-bold text-slate-800 text-sm">
                                                    {d.item_name}
                                                    {d.strength && <span className="text-slate-500 font-normal ml-1">{d.strength}</span>}
                                                </div>
                                                {d.generic_name && <div className="text-[11px] text-slate-500">{d.generic_name}</div>}
                                                <div className="flex items-center justify-between mt-1.5 text-xs">
                                                    <span className="text-slate-500">คงเหลือ <span className={`font-bold ${d.stock_qty > 0 ? "text-slate-700" : "text-red-600"}`}>{d.stock_qty}</span> {d.unit}</span>
                                                    <span className="font-bold text-amber-700 tabular-nums">฿{Number(d.sell_price).toLocaleString()}</span>
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
                                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
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
                                    ไม่มีคอสในระบบ — <Link href="/dashboard/inventory/packages" className="text-blue-600 font-bold underline">เพิ่มคอสใหม่</Link>
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
                                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{p.code}</span>
                                                {p.category && (
                                                    <Badge className="border-0 bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">{p.category}</Badge>
                                                )}
                                            </div>
                                            <div className="font-bold text-slate-800 text-sm line-clamp-1">{p.name}</div>
                                            <div className="flex items-center justify-between mt-1 text-xs">
                                                <span className="text-slate-500">{p.total_sessions} ครั้ง · {p.validity_days}d</span>
                                                <span className="font-bold text-blue-700 tabular-nums">฿{Number(p.price).toLocaleString()}</span>
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
