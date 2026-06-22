"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft, Plus, Minus, Edit3, Package, AlertTriangle, History, X,
    TrendingUp, TrendingDown, CheckCircle, AlertCircle, Pencil, Clock,
} from "lucide-react";
import { receiveStock, adjustStock, updateInventoryItem, updateLot, deleteLot } from "@/lib/actions/inventory";
import { SEGMENT_LABEL } from "@/lib/segments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { item: any; history: any[]; editLogs: any[]; lots: any[] }

function lotExpiryStatus(expiry: string | null): { label: string; cls: string } | null {
    if (!expiry) return null;
    const days = Math.ceil((new Date(expiry + "T00:00:00").getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: "หมดอายุแล้ว", cls: "bg-rose-100 text-rose-700" };
    if (days <= 30) return { label: `อีก ${days} วัน`, cls: "bg-amber-100 text-amber-700" };
    if (days <= 90) return { label: `อีก ${days} วัน`, cls: "bg-yellow-50 text-yellow-700" };
    return { label: `อีก ${days} วัน`, cls: "bg-emerald-50 text-emerald-700" };
}

// ป้ายชื่อฟิลด์ (ภาษาไทย) สำหรับแสดงใน audit log
const FIELD_LABEL: Record<string, string> = {
    item_name: "ชื่อสินค้า", generic_name: "ชื่อสามัญ", trade_name: "ชื่อการค้า",
    strength: "ความแรง", dosage_form: "รูปแบบ", category: "หมวดหมู่", segment: "แผนก",
    unit: "หน่วย", sell_price: "ราคาขาย", cost_price: "ราคาทุน", min_stock: "สต๊อกขั้นต่ำ",
    location: "ที่เก็บ", supplier: "ผู้ขาย", note: "หมายเหตุ", expiry_date: "วันหมดอายุ",
    item_name_th: "ชื่อภาษาไทย", indication: "สรรพคุณ", storage_info: "การเก็บรักษา",
    dose_qty: "ขนาด/ครั้ง", use_type: "วิธีรับประทาน", frequency: "ความถี่",
    sig_text_default: "วิธีใช้ Default", label_type: "ประเภทฉลาก", warning_label: "คำเตือน",
    df_doctor: "DF แพทย์", df_nurse: "DF พยาบาล", df_assistant: "DF ผู้ช่วย",
};

const TX_TYPE_LABEL: Record<string, string> = {
    PO_RECEIVE: "รับเข้า (PO)",
    TRANSFER_IN: "โอนเข้า",
    ADJUST_IN: "ปรับเพิ่ม",
    RETURN_FROM_PATIENT: "คืนจากคนไข้",
    OPENING_STOCK: "ยอดยกมา",
    PRESCRIPTION: "จ่ายยา (Rx)",
    SUPPLY_PRESET: "หัตถการ",
    INVOICE: "ใบเสร็จ",
    INTERNAL_USE: "ใช้ในคลินิก",
    WASTE: "ทิ้ง / หมดอายุ",
    RECALL: "เรียกคืน",
    TRANSFER_OUT: "โอนออก",
    ADJUST_OUT: "ปรับลด",
    SAMPLE_GIVE: "แจกตัวอย่าง",
    LOT_CONVERT: "แปลง Lot",
    RECOUNT: "นับใหม่",
};

const CATEGORY_LABEL: Record<string, string> = {
    drug: "ยา",
    supply: "เวชภัณฑ์",
    service: "บริการ",
    equipment: "อุปกรณ์",
    other: "อื่นๆ",
};

const EDIT_INPUT = "w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";

function EditField({ label, required, colSpan, children }: { label: string; required?: boolean; colSpan?: number; children: React.ReactNode }) {
    return (
        <div className={colSpan === 2 ? "md:col-span-2" : ""}>
            <label className="text-xs font-bold text-slate-600 mb-1 block">{label}{required && <span className="text-rose-500"> *</span>}</label>
            {children}
        </div>
    );
}

function fmtDateTime(d: string): string {
    try { return new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }); }
    catch { return d; }
}

function fmtVal(field: string, v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (field === "segment") return SEGMENT_LABEL[String(v)] || String(v);
    if (field === "category") return CATEGORY_LABEL[String(v)] || String(v);
    return String(v);
}

export default function InventoryDetailClient({ item, history, editLogs, lots }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showReceive, setShowReceive] = useState(false);
    const [showAdjust, setShowAdjust] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // ── ฟอร์มแก้ไขรายละเอียด ──
    const [edit, setEdit] = useState({
        item_name: item.item_name || "", generic_name: item.generic_name || "",
        trade_name: item.trade_name || "", strength: item.strength || "",
        dosage_form: item.dosage_form || "", category: item.category || "drug",
        segment: item.segment || "product", unit: item.unit || "",
        sell_price: (item.sell_price ?? "").toString(), cost_price: (item.cost_price ?? "").toString(),
        min_stock: (item.min_stock ?? "").toString(), location: item.location || "",
        supplier: item.supplier || "", note: item.note || "", expiry_date: item.expiry_date || "",
        // ฉลากยา
        item_name_th: item.item_name_th || "", indication: item.indication || "",
        storage_info: item.storage_info || "", dose_qty: item.dose_qty || "",
        use_type: item.use_type || "", frequency: item.frequency || "",
        sig_text_default: item.sig_text_default || "", label_type: item.label_type || "",
        warning_label: item.warning_label || "",
        // DF
        df_doctor: (item.df_doctor ?? "").toString(), df_nurse: (item.df_nurse ?? "").toString(),
        df_assistant: (item.df_assistant ?? "").toString(),
    });

    function saveEdit() {
        setError(null); setSuccess(null);
        if (!edit.item_name.trim()) { setError("ชื่อสินค้าห้ามว่าง"); return; }
        startTransition(async () => {
            const res = await updateInventoryItem({ id: item.id, ...edit });
            if (!res.success) { setError(res.error || "บันทึกไม่สำเร็จ"); return; }
            setShowEdit(false);
            setSuccess(res.changed === 0 ? "ไม่มีการเปลี่ยนแปลง" : `✓ บันทึกการแก้ไข ${res.changed} ช่องแล้ว`);
            setTimeout(() => router.refresh(), 800);
        });
    }

    // ── แก้ไข/ลบ ล็อต ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [lotEdit, setLotEdit] = useState<any | null>(null);
    function saveLot() {
        if (!lotEdit) return;
        setError(null);
        startTransition(async () => {
            const res = await updateLot({ id: lotEdit.id, lot_no: lotEdit.lot_no, expiry_date: lotEdit.expiry_date || null, qty_remaining: Number(lotEdit.qty_remaining) || 0 });
            if (!res.success) { setError(res.error || "บันทึกล็อตไม่สำเร็จ"); return; }
            setLotEdit(null); setSuccess("✓ บันทึกล็อตแล้ว");
            setTimeout(() => router.refresh(), 600);
        });
    }
    function removeLot(id: string) {
        if (!confirm("ลบล็อตนี้? (สต๊อกจะถูกลดตามจำนวนคงเหลือของล็อต)")) return;
        startTransition(async () => {
            const res = await deleteLot(id);
            if (!res.success) { setError(res.error || "ลบล็อตไม่สำเร็จ"); return; }
            setSuccess("✓ ลบล็อตแล้ว");
            setTimeout(() => router.refresh(), 600);
        });
    }

    const isLow = item.min_stock > 0 && Number(item.stock_qty) <= Number(item.min_stock);
    // มูลค่าสต๊อก (Inventory Value) — คิดจากต้นทุน (cost) ไม่ใช่ราคาขาย
    const stockValue = Number(item.cost_price || 0) * Number(item.stock_qty || 0);

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <Link href="/dashboard/inventory">
                        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 h-9 text-slate-600 hover:text-slate-800">
                            <ArrowLeft className="h-4 w-4" /> กลับ
                        </Button>
                    </Link>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded">{item.item_code || "—"}</span>
                    <span className="font-bold text-slate-800">{item.item_name}</span>
                    {!item.is_active && <Badge className="bg-slate-200 text-slate-600 border-0">ปิดใช้งาน</Badge>}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => setShowReceive(true)}
                        className="rounded-xl gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20"
                    >
                        <Plus className="h-4 w-4" /> รับยาเข้า
                    </Button>
                    <Button
                        onClick={() => setShowAdjust(true)}
                        variant="outline"
                        className="rounded-xl gap-1.5 h-9 border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                        <Edit3 className="h-4 w-4" /> ปรับสต๊อก
                    </Button>
                    <Button
                        onClick={() => setShowEdit(true)}
                        variant="outline"
                        className="rounded-xl gap-1.5 h-9 border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                        <Pencil className="h-4 w-4" /> แก้ไขรายละเอียด
                    </Button>
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

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

                {/* ═══ LEFT — Info + History ═══ */}
                <div className="space-y-4">
                    {/* Info card */}
                    <div className="gonix-card-premium p-5">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/60">
                            <Package className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">ข้อมูลรายการ</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">ชื่อสามัญ</div>
                                <div className="font-semibold">{item.generic_name || "—"}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">หมวด</div>
                                <div className="font-semibold">{CATEGORY_LABEL[item.category] || item.category}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">รูปแบบ</div>
                                <div className="font-semibold">{item.dosage_form || "—"}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">ความแรง</div>
                                <div className="font-semibold">{item.strength || "—"}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">หน่วย</div>
                                <div className="font-semibold">{item.unit}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">หน่วยซื้อ</div>
                                <div className="font-semibold">{item.purchase_unit || item.unit} (×{item.conversion_factor || 1})</div>
                            </div>
                            {item.indication && (
                                <div className="col-span-2">
                                    <div className="text-[11px] text-slate-500 uppercase tracking-wider">ข้อบ่งใช้</div>
                                    <div className="text-sm text-slate-700">{item.indication}</div>
                                </div>
                            )}
                            {item.warning_label && (
                                <div className="col-span-2">
                                    <div className="text-[11px] text-red-600 uppercase tracking-wider font-bold">⚠ คำเตือน</div>
                                    <div className="text-sm text-red-700 font-semibold">{item.warning_label}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* History */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200/60 bg-slate-50/40">
                            <History className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">ประวัติการเคลื่อนไหว</h2>
                            <span className="text-xs text-slate-500">({history.length} รายการ)</span>
                        </div>
                        {history.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-500">ยังไม่มีประวัติการเคลื่อนไหว</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2">วันที่</th>
                                            <th className="text-left px-4 py-2">ประเภท</th>
                                            <th className="text-right px-4 py-2 w-20">+/-</th>
                                            <th className="text-right px-4 py-2 w-20">คงเหลือ</th>
                                            <th className="text-left px-4 py-2">หมายเหตุ</th>
                                            <th className="text-left px-4 py-2 hidden md:table-cell">ผู้บันทึก</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((h) => {
                                            const isPositive = Number(h.qty_delta) >= 0;
                                            const recorder = Array.isArray(h.recorded_by) ? h.recorded_by[0] : h.recorded_by;
                                            const recorderName = recorder?.profiles?.full_name || recorder?.profiles?.[0]?.full_name || "—";
                                            return (
                                                <tr key={h.id} className="border-t border-slate-100">
                                                    <td className="px-4 py-2 text-xs text-slate-600 tabular-nums">
                                                        {new Date(h.recorded_at).toLocaleString("th-TH", {
                                                            day: "numeric", month: "short", year: "2-digit",
                                                            hour: "2-digit", minute: "2-digit",
                                                        })}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <span className="text-[11px] font-bold text-slate-700">
                                                            {TX_TYPE_LABEL[h.tx_type] || h.tx_type}
                                                        </span>
                                                    </td>
                                                    <td className={`px-4 py-2 text-right font-bold tabular-nums ${isPositive ? "text-emerald-700" : "text-rose-600"}`}>
                                                        <span className="inline-flex items-center gap-0.5 justify-end">
                                                            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                                            {isPositive ? "+" : ""}{Number(h.qty_delta).toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-semibold tabular-nums">
                                                        {Number(h.balance_after).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-2 text-xs text-slate-600 max-w-[200px] truncate" title={h.note || ""}>
                                                        {h.ref_vn && <span className="font-mono text-blue-700 mr-1">{h.ref_vn}</span>}
                                                        {h.note || "—"}
                                                    </td>
                                                    <td className="px-4 py-2 text-xs text-slate-600 hidden md:table-cell">{recorderName}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ RIGHT — Stock summary ═══ */}
                <div className="lg:sticky lg:top-4 space-y-3">
                    <div className={`gonix-card-premium p-5 ${isLow ? "ring-2 ring-red-200" : ""}`}>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">คงเหลือ</div>
                        <div className={`text-4xl font-black tabular-nums mt-1 ${isLow ? "text-red-700" : "text-slate-800"}`}>
                            {Number(item.stock_qty || 0).toLocaleString()}
                            <span className="text-lg text-slate-500 font-normal ml-2">{item.unit}</span>
                        </div>
                        {isLow && (
                            <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
                                <AlertTriangle className="h-3 w-3" />
                                สต๊อกต่ำกว่าจุดสั่งซื้อ ({item.min_stock})
                            </div>
                        )}

                        <div className="mt-4 pt-4 border-t border-slate-200/60 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">จุดสั่งซื้อ (Min)</span>
                                <span className="font-semibold tabular-nums">{Number(item.min_stock || 0).toLocaleString()} {item.unit}</span>
                            </div>
                            {item.expiry_date && (() => {
                                const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) + "T00:00:00");
                                const exp = new Date(item.expiry_date + "T00:00:00");
                                const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
                                const cls = days < 0 ? "text-red-700" : days <= 90 ? "text-orange-700" : "text-slate-800";
                                return (
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">วันหมดอายุ</span>
                                        <span className={`font-bold tabular-nums ${cls}`}>
                                            {new Date(item.expiry_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                            {days < 0 ? ` · หมดแล้ว ${Math.abs(days)} วัน` : days <= 90 ? ` · เหลือ ${days} วัน` : ""}
                                        </span>
                                    </div>
                                );
                            })()}
                            <div className="flex justify-between">
                                <span className="text-slate-500">ราคาทุน</span>
                                <span className="font-semibold tabular-nums">฿{Number(item.cost_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">ราคาขาย</span>
                                <span className="font-bold text-emerald-700 tabular-nums">฿{Number(item.sell_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-slate-200/60">
                                <span className="text-slate-500">มูลค่าสต๊อก</span>
                                <span className="font-bold text-slate-800 tabular-nums">฿{stockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ล็อตสินค้า (FEFO — หมดอายุก่อนอยู่บน) */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-700" />
                    <h2 className="text-sm font-bold text-slate-800">ล็อตสินค้า (Lot / วันหมดอายุ)</h2>
                    <span className="text-xs text-slate-400">({lots.length})</span>
                    <span className="ml-auto text-[11px] text-slate-400">รับล็อตใหม่ด้วยปุ่ม &quot;รับยาเข้า&quot;</span>
                </div>
                {lots.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีล็อต — กด &quot;รับยาเข้า&quot; แล้วกรอกเลขล็อต + วันหมดอายุ</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2">Lot No.</th>
                                    <th className="text-left px-4 py-2">วันหมดอายุ</th>
                                    <th className="text-right px-4 py-2">คงเหลือ</th>
                                    <th className="text-right px-4 py-2 hidden sm:table-cell">รับเข้า</th>
                                    <th className="text-right px-4 py-2 hidden md:table-cell">ทุน/หน่วย</th>
                                    <th className="px-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lots.map((l) => {
                                    const st = lotExpiryStatus(l.expiry_date);
                                    const out = Number(l.qty_remaining) <= 0;
                                    return (
                                        <tr key={l.id} className={`border-t border-slate-100 ${out ? "opacity-50" : ""}`}>
                                            <td className="px-4 py-2.5 font-mono text-slate-700">{l.lot_no || "—"}</td>
                                            <td className="px-4 py-2.5">
                                                {l.expiry_date ? (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <span className="tabular-nums">{new Date(l.expiry_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span>
                                                        {st && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>}
                                                    </span>
                                                ) : <span className="text-slate-400">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{Number(l.qty_remaining).toLocaleString()} {item.unit}</td>
                                            <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums hidden sm:table-cell">{Number(l.qty_received).toLocaleString()}</td>
                                            <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums hidden md:table-cell">{Number(l.cost_per_unit) > 0 ? `฿${Number(l.cost_per_unit).toLocaleString()}` : "—"}</td>
                                            <td className="px-2 py-2.5">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <button onClick={() => setLotEdit({ id: l.id, lot_no: l.lot_no || "", expiry_date: l.expiry_date || "", qty_remaining: Number(l.qty_remaining) })} className="text-slate-300 hover:text-blue-600 p-1" title="แก้ไข"><Pencil className="h-3.5 w-3.5" /></button>
                                                    <button onClick={() => removeLot(l.id)} disabled={pending} className="text-slate-300 hover:text-rose-600 p-1 disabled:opacity-40" title="ลบ"><X className="h-3.5 w-3.5" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ประวัติการแก้ไขข้อมูล (audit) */}
            {editLogs.length > 0 && (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-700" />
                        <h2 className="text-sm font-bold text-slate-800">ประวัติการแก้ไขข้อมูล</h2>
                        <span className="text-xs text-slate-400">({editLogs.length})</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {editLogs.map((log) => (
                            <div key={log.id} className="px-5 py-3">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <span className="text-sm font-bold text-slate-700">{log.by}</span>
                                    <span className="text-xs text-slate-400">{fmtDateTime(log.performed_at)}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.keys(log.new_data || {}).map((f) => (
                                        <span key={f} className="text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1">
                                            <span className="font-bold text-slate-600">{FIELD_LABEL[f] || f}:</span>{" "}
                                            <span className="text-rose-500 line-through">{fmtVal(f, log.old_data?.[f])}</span>{" "}
                                            <span className="text-slate-400">→</span>{" "}
                                            <span className="text-emerald-600 font-semibold">{fmtVal(f, log.new_data?.[f])}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Receive Modal */}
            {showReceive && (
                <ReceiveModal
                    itemId={item.id}
                    itemName={item.item_name}
                    unit={item.unit}
                    currentStock={Number(item.stock_qty || 0)}
                    onClose={() => setShowReceive(false)}
                    onSuccess={(qty) => {
                        setSuccess(`✓ รับเข้าสต๊อก ${qty} ${item.unit} สำเร็จ`);
                        setShowReceive(false);
                        startTransition(() => router.refresh());
                    }}
                    onError={setError}
                />
            )}

            {/* Adjust Modal */}
            {showAdjust && (
                <AdjustModal
                    itemId={item.id}
                    itemName={item.item_name}
                    unit={item.unit}
                    currentStock={Number(item.stock_qty || 0)}
                    onClose={() => setShowAdjust(false)}
                    onSuccess={() => {
                        setSuccess(`✓ ปรับสต๊อกสำเร็จ`);
                        setShowAdjust(false);
                        startTransition(() => router.refresh());
                    }}
                    onError={setError}
                />
            )}

            {/* Edit lot Modal */}
            {lotEdit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2"><Package className="h-5 w-5 text-blue-600" /> แก้ไขล็อต</h3>
                            <button onClick={() => setLotEdit(null)} className="rounded-lg p-1.5 hover:bg-slate-100"><X className="h-5 w-5 text-slate-500" /></button>
                        </div>
                        <div className="space-y-3">
                            <div><label className="text-xs font-bold text-slate-600 mb-1 block">Lot No.</label>
                                <Input value={lotEdit.lot_no} onChange={(e) => setLotEdit({ ...lotEdit, lot_no: e.target.value })} className={`${EDIT_INPUT} font-mono`} /></div>
                            <div><label className="text-xs font-bold text-slate-600 mb-1 block">วันหมดอายุ</label>
                                <Input type="date" value={lotEdit.expiry_date ? String(lotEdit.expiry_date).slice(0, 10) : ""} onChange={(e) => setLotEdit({ ...lotEdit, expiry_date: e.target.value })} className={EDIT_INPUT} /></div>
                            <div><label className="text-xs font-bold text-slate-600 mb-1 block">คงเหลือ ({item.unit})</label>
                                <Input type="number" value={lotEdit.qty_remaining} onChange={(e) => setLotEdit({ ...lotEdit, qty_remaining: e.target.value })} className={`${EDIT_INPUT} text-right tabular-nums`} />
                                <p className="text-[10px] text-slate-400 mt-1">แก้คงเหลือ → สต๊อกรวมของรายการจะปรับตามส่วนต่าง</p></div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setLotEdit(null)} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                            <Button onClick={saveLot} disabled={pending} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">{pending ? "กำลังบันทึก..." : "บันทึก"}</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit details Modal */}
            {showEdit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-5 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2"><Pencil className="h-5 w-5 text-blue-600" /> แก้ไขรายละเอียด: {item.item_name}</h3>
                            <button onClick={() => setShowEdit(false)} className="rounded-lg p-1.5 hover:bg-slate-100"><X className="h-5 w-5 text-slate-500" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
                            <EditField label="ชื่อสินค้า" required colSpan={2}>
                                <Input value={edit.item_name} onChange={(e) => setEdit({ ...edit, item_name: e.target.value })} className={EDIT_INPUT} />
                            </EditField>
                            <EditField label="ชื่อสามัญ"><Input value={edit.generic_name} onChange={(e) => setEdit({ ...edit, generic_name: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="ชื่อการค้า"><Input value={edit.trade_name} onChange={(e) => setEdit({ ...edit, trade_name: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="ความแรง"><Input value={edit.strength} onChange={(e) => setEdit({ ...edit, strength: e.target.value })} placeholder="เช่น 500 mg" className={EDIT_INPUT} /></EditField>
                            <EditField label="รูปแบบ"><Input value={edit.dosage_form} onChange={(e) => setEdit({ ...edit, dosage_form: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="หมวดหมู่">
                                <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className={EDIT_INPUT}>
                                    <option value="drug">ยา (Drug)</option><option value="supply">เวชภัณฑ์ (Supply)</option><option value="service">บริการ (Service)</option>
                                </select>
                            </EditField>
                            <EditField label="แผนก (รายได้)">
                                <select value={edit.segment} onChange={(e) => setEdit({ ...edit, segment: e.target.value })} className={EDIT_INPUT}>
                                    <option value="product">ขายของ (Product)</option><option value="medical">การแพทย์ (Medical)</option><option value="aesthetic">ความงาม (Aesthetic)</option>
                                </select>
                            </EditField>
                            <EditField label="หน่วย"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="เม็ด / ขวد" className={EDIT_INPUT} /></EditField>
                            <EditField label="ราคาขาย (฿)"><Input type="number" value={edit.sell_price} onChange={(e) => setEdit({ ...edit, sell_price: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="ราคาทุน (฿)"><Input type="number" value={edit.cost_price} onChange={(e) => setEdit({ ...edit, cost_price: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="สต๊อกขั้นต่ำ"><Input type="number" value={edit.min_stock} onChange={(e) => setEdit({ ...edit, min_stock: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="วันหมดอายุ"><Input type="date" value={edit.expiry_date ? String(edit.expiry_date).slice(0, 10) : ""} onChange={(e) => setEdit({ ...edit, expiry_date: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="ที่เก็บ"><Input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="ผู้ขาย"><Input value={edit.supplier} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="หมายเหตุ" colSpan={2}>
                                <textarea value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} rows={2} className={`${EDIT_INPUT} resize-none`} />
                            </EditField>

                            {/* ── ข้อมูลฉลากยา ── */}
                            <div className="md:col-span-2 mt-1 pt-2 border-t border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">ข้อมูลฉลากยา</div>
                            <EditField label="ชื่อภาษาไทย"><Input value={edit.item_name_th} onChange={(e) => setEdit({ ...edit, item_name_th: e.target.value })} placeholder="ชื่อบนฉลาก" className={EDIT_INPUT} /></EditField>
                            <EditField label="สรรพคุณ"><Input value={edit.indication} onChange={(e) => setEdit({ ...edit, indication: e.target.value })} placeholder="ยาบรรเทาปวด ลดไข้" className={EDIT_INPUT} /></EditField>
                            <EditField label="ขนาด/ครั้ง"><Input value={edit.dose_qty} onChange={(e) => setEdit({ ...edit, dose_qty: e.target.value })} placeholder="1 เม็ด" className={EDIT_INPUT} /></EditField>
                            <EditField label="วิธีรับประทาน"><Input value={edit.use_type} onChange={(e) => setEdit({ ...edit, use_type: e.target.value })} placeholder="หลังอาหาร" className={EDIT_INPUT} /></EditField>
                            <EditField label="ความถี่"><Input value={edit.frequency} onChange={(e) => setEdit({ ...edit, frequency: e.target.value })} placeholder="วันละ 3 ครั้ง" className={EDIT_INPUT} /></EditField>
                            <EditField label="ประเภทฉลาก"><Input value={edit.label_type} onChange={(e) => setEdit({ ...edit, label_type: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="วิธีใช้ Default (Sig)" colSpan={2}><Input value={edit.sig_text_default} onChange={(e) => setEdit({ ...edit, sig_text_default: e.target.value })} placeholder="รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร" className={EDIT_INPUT} /></EditField>
                            <EditField label="การเก็บรักษา" colSpan={2}><Input value={edit.storage_info} onChange={(e) => setEdit({ ...edit, storage_info: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="คำเตือน" colSpan={2}><Input value={edit.warning_label} onChange={(e) => setEdit({ ...edit, warning_label: e.target.value })} placeholder="ห้ามใช้เกินขนาด / ง่วงนอน" className={EDIT_INPUT} /></EditField>

                            {/* ── ค่าตอบแทน (DF) ── */}
                            <div className="md:col-span-2 mt-1 pt-2 border-t border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">ค่าตอบแทน (DF) ต่อหน่วย</div>
                            <EditField label="DF แพทย์ (฿)"><Input type="number" value={edit.df_doctor} onChange={(e) => setEdit({ ...edit, df_doctor: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="DF พยาบาล (฿)"><Input type="number" value={edit.df_nurse} onChange={(e) => setEdit({ ...edit, df_nurse: e.target.value })} className={EDIT_INPUT} /></EditField>
                            <EditField label="DF ผู้ช่วย (฿)"><Input type="number" value={edit.df_assistant} onChange={(e) => setEdit({ ...edit, df_assistant: e.target.value })} className={EDIT_INPUT} /></EditField>
                        </div>
                        <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-200 bg-slate-50/50">
                            <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> การแก้ไขจะถูกบันทึก audit (ใคร/อะไร/เมื่อไหร่)</span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setShowEdit(false)} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                                <Button onClick={saveEdit} disabled={pending} className="rounded-xl gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                                    {pending ? "กำลังบันทึก..." : "บันทึก"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ReceiveModal({
    itemId, itemName, unit, currentStock, onClose, onSuccess, onError,
}: {
    itemId: string;
    itemName: string;
    unit: string;
    currentStock: number;
    onClose: () => void;
    onSuccess: (qty: number) => void;
    onError: (msg: string) => void;
}) {
    const [qty, setQty] = useState("");
    const [cost, setCost] = useState("");
    const [lot, setLot] = useState("");
    const [expiry, setExpiry] = useState("");
    const [note, setNote] = useState("");
    const [pending, startTransition] = useTransition();

    function handleSubmit() {
        const q = parseFloat(qty);
        if (!q || q <= 0) {
            onError("กรุณากรอกจำนวนที่รับเข้า");
            return;
        }
        startTransition(async () => {
            const res = await receiveStock({
                item_id: itemId,
                qty: q,
                cost_per_unit: cost ? parseFloat(cost) : undefined,
                note: note || undefined,
                lot_no: lot || undefined,
                expiry_date: expiry || undefined,
            });
            if (!res.success) {
                onError(res.error || "Error");
                return;
            }
            onSuccess(q);
        });
    }

    const newStock = currentStock + (parseFloat(qty) || 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Plus className="h-5 w-5 text-emerald-700" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">รับยาเข้า</h3>
                            <p className="text-xs text-slate-500 truncate">{itemName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">จำนวน *</Label>
                    <div className="flex items-center gap-2 mt-1">
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={qty}
                            onChange={e => setQty(e.target.value)}
                            placeholder="0"
                            className="text-right text-base font-bold tabular-nums"
                        />
                        <span className="text-sm text-slate-500 shrink-0">{unit}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                        คงเหลือเดิม: <span className="font-bold tabular-nums">{currentStock.toLocaleString()}</span>
                        {qty && (
                            <> → ใหม่: <span className="font-bold text-emerald-700 tabular-nums">{newStock.toLocaleString()}</span> {unit}</>
                        )}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">ราคาทุน/หน่วย</Label>
                        <div className="relative mt-1">
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cost}
                                onChange={e => setCost(e.target.value)}
                                placeholder="0.00"
                                className="pl-7 text-right tabular-nums"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">฿</span>
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">Lot No.</Label>
                        <Input value={lot} onChange={e => setLot(e.target.value)} placeholder="—" className="mt-1 font-mono" />
                    </div>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">วันหมดอายุ (ล็อตนี้)</Label>
                    <Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="mt-1" />
                    <p className="text-[11px] text-slate-400 mt-1">ระบบจะแท็กวันหมดอายุของรายการจากล็อตที่ใกล้หมดสุด</p>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">หมายเหตุ</Label>
                    <Input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น Supplier, PO#..." className="mt-1" />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={pending || !qty}
                        className="rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/25"
                    >
                        <Plus className="h-4 w-4" />
                        {pending ? "กำลังรับเข้า..." : "ยืนยันรับเข้า"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function AdjustModal({
    itemId, itemName, unit, currentStock, onClose, onSuccess, onError,
}: {
    itemId: string;
    itemName: string;
    unit: string;
    currentStock: number;
    onClose: () => void;
    onSuccess: () => void;
    onError: (msg: string) => void;
}) {
    const [newQty, setNewQty] = useState(currentStock.toString());
    const [reason, setReason] = useState("");
    const [txType, setTxType] = useState<"RECOUNT" | "WASTE" | "ADJUST_OUT" | "ADJUST_IN">("RECOUNT");
    const [pending, startTransition] = useTransition();

    const n = parseFloat(newQty) || 0;
    const delta = n - currentStock;

    function handleSubmit() {
        if (!reason.trim()) {
            onError("กรุณาระบุเหตุผล");
            return;
        }
        if (n < 0) {
            onError("จำนวนต้องไม่ติดลบ");
            return;
        }
        startTransition(async () => {
            const res = await adjustStock({
                item_id: itemId,
                new_qty: n,
                reason: reason.trim(),
                tx_type: txType,
            });
            if (!res.success) {
                onError(res.error || "Error");
                return;
            }
            onSuccess();
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Edit3 className="h-5 w-5 text-amber-700" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">ปรับสต๊อก</h3>
                            <p className="text-xs text-slate-500 truncate">{itemName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">ประเภท</Label>
                    <select
                        value={txType}
                        onChange={e => setTxType(e.target.value as "RECOUNT" | "WASTE" | "ADJUST_OUT" | "ADJUST_IN")}
                        className="mt-1 flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    >
                        <option value="RECOUNT">นับใหม่ (RECOUNT)</option>
                        <option value="WASTE">ทิ้ง / หมดอายุ (WASTE)</option>
                        <option value="ADJUST_OUT">ปรับลด (ของหาย)</option>
                        <option value="ADJUST_IN">ปรับเพิ่ม</option>
                    </select>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">จำนวนใหม่ (หลังนับ) *</Label>
                    <div className="flex items-center gap-2 mt-1">
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={newQty}
                            onChange={e => setNewQty(e.target.value)}
                            className="text-right text-base font-bold tabular-nums"
                        />
                        <span className="text-sm text-slate-500 shrink-0">{unit}</span>
                    </div>
                    <p className="text-[11px] mt-1">
                        เดิม: <span className="font-bold tabular-nums text-slate-700">{currentStock.toLocaleString()}</span>
                        <> → ใหม่: <span className="font-bold tabular-nums text-slate-700">{n.toLocaleString()}</span></>
                        {delta !== 0 && (
                            <span className={`ml-2 font-bold ${delta > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                                ({delta > 0 ? "+" : ""}{delta.toLocaleString()})
                            </span>
                        )}
                    </p>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">เหตุผล *</Label>
                    <Input
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="เช่น นับสต๊อกประจำเดือน, ยาหมดอายุ, ของหายระหว่างขนส่ง"
                        className="mt-1"
                    />
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    ⚠ การปรับสต๊อกจะบันทึก audit log — ผู้ตรวจสอบจะดูได้ภายหลัง
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={pending || !reason.trim() || delta === 0}
                        className="rounded-xl gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/25"
                    >
                        <Edit3 className="h-4 w-4" />
                        {pending ? "กำลังปรับ..." : "ยืนยันปรับ"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
