"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Plus, Pencil, Trash2, AlertCircle, CheckCircle, X, Eye, EyeOff, Search,
} from "lucide-react";
import {
    type ServiceCatalogItem, type ServiceItemType, type InventoryPick,
    SERVICE_ITEM_TYPE_LABEL, SERVICE_ITEM_TYPE_COLOR, SERVICE_ITEM_TYPE_OPTIONS,
} from "@/lib/service-types";
import {
    createService, updateService, deleteService, backfillMissingCodes, type ServiceInput,
} from "@/lib/actions/services";
import { Wand2, FileText, Package } from "lucide-react";
import { HorizontalForm, Section, FieldRow, FORM_INPUT_CLS, FORM_SELECT_CLS } from "@/components/ui/horizontal-form";

export default function ServicesClient({ initialServices, inventory }: { initialServices: ServiceCatalogItem[]; inventory: InventoryPick[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<ServiceCatalogItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<ServiceCatalogItem | null>(null);
    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState<ServiceItemType | "all">("all");

    const filtered = useMemo(() => {
        return initialServices.filter(s => {
            if (filterType !== "all" && s.item_type !== filterType) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!s.service_name.toLowerCase().includes(q) &&
                    !(s.service_code || "").toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [initialServices, search, filterType]);

    const activeCount = initialServices.filter(s => s.is_active).length;
    const missingCodeCount = initialServices.filter(s => !s.service_code).length;

    function openCreate() {
        setEditing(null);
        setShowForm(true);
        setError(null);
        setSuccess(null);
    }

    function openEdit(s: ServiceCatalogItem) {
        setEditing(s);
        setShowForm(true);
        setError(null);
        setSuccess(null);
    }

    function handleDelete(s: ServiceCatalogItem) {
        setError(null);
        startTransition(async () => {
            const res = await deleteService(s.id);
            if (!res.success) {
                setError(res.error || "ลบไม่สำเร็จ");
                return;
            }
            setSuccess(`✓ ปิดการใช้งาน "${s.service_name}" แล้ว`);
            setConfirmDelete(null);
            router.refresh();
        });
    }

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-blue-700">รายการบริการ & ราคา</span>
                    <span className="text-slate-300">·</span>
                    <span>เปิดใช้งาน <span className="font-bold text-slate-700 tabular-nums">{activeCount}</span> / {initialServices.length} รายการ</span>
                </p>
                <div className="flex items-center gap-2">
                    {missingCodeCount > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startTransition(async () => {
                                const res = await backfillMissingCodes();
                                if (!res.success) setError(res.error || "เติมรหัสไม่สำเร็จ");
                                else {
                                    setSuccess(`✓ เติมรหัสให้ ${res.updated} รายการ`);
                                    router.refresh();
                                }
                            })}
                            disabled={pending}
                            className="rounded-xl gap-1.5 h-9 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                            title={`มี ${missingCodeCount} รายการที่ยังไม่มีรหัส`}
                        >
                            <Wand2 className="h-3.5 w-3.5" /> เติมรหัสอัตโนมัติ ({missingCodeCount})
                        </Button>
                    )}
                    <Button onClick={openCreate} className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                        <Plus className="h-4 w-4" /> เพิ่มรายการ
                    </Button>
                </div>
            </div>

            {/* Alerts */}
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

            {/* Search + filter */}
            <div className="gonix-card-premium p-4 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                        type="search"
                        placeholder="ค้นหาชื่อรายการหรือรหัส..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10 h-10 rounded-xl focus:ring-blue-500/10 focus:border-blue-500"
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <FilterChip active={filterType === "all"} onClick={() => setFilterType("all")}>ทั้งหมด</FilterChip>
                    {SERVICE_ITEM_TYPE_OPTIONS.map(opt => (
                        <FilterChip key={opt.value} active={filterType === opt.value} onClick={() => setFilterType(opt.value)}>
                            {opt.label}
                        </FilterChip>
                    ))}
                </div>
            </div>

            {/* List */}
            {initialServices.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-blue-100/60 flex items-center justify-center mx-auto mb-3">
                        <Plus className="h-8 w-8 text-blue-600" />
                    </div>
                    <h2 className="text-base font-bold text-slate-700">ยังไม่มีรายการบริการ</h2>
                    <p className="text-sm text-slate-500 mt-1 mb-4">เริ่มเซ็ตรายการบริการ + ราคา สำหรับให้เคาท์เตอร์เลือกใช้ตอนคิดเงิน</p>
                    <Button onClick={openCreate} className="rounded-xl gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white">
                        <Plus className="h-4 w-4" /> เพิ่มรายการแรก
                    </Button>
                </div>
            ) : (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2.5">รหัส</th>
                                    <th className="text-left px-4 py-2.5">ประเภท</th>
                                    <th className="text-left px-4 py-2.5">ชื่อรายการ</th>
                                    <th className="text-right px-4 py-2.5">ราคา</th>
                                    <th className="text-center px-4 py-2.5">เวลา (นาที)</th>
                                    <th className="text-center px-4 py-2.5">สถานะ</th>
                                    <th className="w-32"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">ไม่พบรายการตามเงื่อนไข</td></tr>
                                ) : filtered.map(s => (
                                    <tr key={s.id} className={`border-t border-slate-100 hover:bg-slate-50/40 ${!s.is_active ? "opacity-50" : ""}`}>
                                        <td className="px-4 py-2.5">
                                            <span className="font-mono text-[11px] text-slate-600">{s.service_code || "—"}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${SERVICE_ITEM_TYPE_COLOR[s.item_type] || SERVICE_ITEM_TYPE_COLOR.other}`}>
                                                {SERVICE_ITEM_TYPE_LABEL[s.item_type] || s.item_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="font-bold text-slate-800">{s.service_name}</div>
                                            {s.note && <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{s.note}</div>}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-bold tabular-nums text-emerald-700">
                                            ฿{Number(s.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-2.5 text-center text-xs text-slate-600">{s.duration_min || "—"}</td>
                                        <td className="px-4 py-2.5 text-center">
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                                s.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                                            }`}>
                                                {s.is_active ? "เปิดใช้" : "ปิด"}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <div className="inline-flex items-center gap-0.5">
                                                <button onClick={() => openEdit(s)} className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100" title="แก้ไข">
                                                    <Pencil className="h-3.5 w-3.5 mx-auto" />
                                                </button>
                                                <button
                                                    onClick={() => startTransition(async () => {
                                                        const res = await updateService(s.id, { is_active: !s.is_active });
                                                        if (!res.success) setError(res.error || "Error");
                                                        else router.refresh();
                                                    })}
                                                    className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100"
                                                    title={s.is_active ? "ซ่อน" : "เปิดใช้"}
                                                >
                                                    {s.is_active ? <EyeOff className="h-3.5 w-3.5 mx-auto" /> : <Eye className="h-3.5 w-3.5 mx-auto" />}
                                                </button>
                                                <button onClick={() => setConfirmDelete(s)} className="h-7 w-7 rounded-lg text-red-500 hover:bg-red-50" title="ลบ">
                                                    <Trash2 className="h-3.5 w-3.5 mx-auto" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Form modal */}
            {showForm && (
                <ServiceFormModal
                    initial={editing}
                    inventory={inventory}
                    onClose={() => setShowForm(false)}
                    onSubmit={async (data) => {
                        setError(null);
                        const res = editing
                            ? await updateService(editing.id, data)
                            : await createService(data);
                        if (!res.success) {
                            setError(res.error || "Error");
                            return false;
                        }
                        setSuccess(editing ? `✓ บันทึกการแก้ไข "${data.service_name}" แล้ว` : `✓ สร้าง "${data.service_name}" สำเร็จ`);
                        setShowForm(false);
                        router.refresh();
                        return true;
                    }}
                />
            )}

            {/* Confirm delete */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-3">
                        <h3 className="text-lg font-bold text-slate-900">ยืนยันลบรายการ</h3>
                        <p className="text-sm text-slate-600">
                            รายการ <strong>{confirmDelete.service_name}</strong> จะถูกปิดการใช้งาน (Soft delete) — invoice เก่ายังคงอยู่
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                            <Button onClick={() => handleDelete(confirmDelete)} disabled={pending} className="rounded-xl bg-red-600 hover:bg-red-700 text-white">
                                {pending ? "กำลังลบ..." : "ยืนยันลบ"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                active ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
        >
            {children}
        </button>
    );
}

function ServiceFormModal({
    initial, inventory, onClose, onSubmit,
}: {
    initial: ServiceCatalogItem | null;
    inventory: InventoryPick[];
    onClose: () => void;
    onSubmit: (data: ServiceInput) => Promise<boolean>;
}) {
    const [serviceName, setServiceName] = useState(initial?.service_name || "");
    const [serviceCode, setServiceCode] = useState(initial?.service_code || "");
    const [itemType, setItemType] = useState<ServiceItemType>(initial?.item_type as ServiceItemType || "service");
    const [sellingPrice, setSellingPrice] = useState(initial?.selling_price?.toString() || "");
    const [durationMin, setDurationMin] = useState(initial?.duration_min?.toString() || "30");
    const [note, setNote] = useState(initial?.note || "");
    const [kitId, setKitId] = useState(initial?.inventory_item_id || "");
    const [consumeQty, setConsumeQty] = useState(initial?.consume_qty?.toString() || "1");
    const [segment, setSegment] = useState(initial?.segment || "medical");
    const [submitting, setSubmitting] = useState(false);

    async function handleSave() {
        setSubmitting(true);
        await onSubmit({
            service_code: serviceCode,
            service_name: serviceName,
            item_type: itemType,
            selling_price: parseFloat(sellingPrice) || 0,
            duration_min: parseInt(durationMin) || 30,
            note,
            is_active: initial?.is_active ?? true,
            inventory_item_id: kitId || null,
            consume_qty: kitId ? (parseFloat(consumeQty) || 1) : null,
            segment,
        });
        setSubmitting(false);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-900">
                        {initial ? "แก้ไขรายการ" : "เพิ่มรายการบริการใหม่"}
                    </h3>
                    <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    <HorizontalForm>
                        <Section title="รายละเอียดรายการ" icon={FileText} color="teal">
                            <FieldRow label="รหัส" hint={!initial ? "เช่น EKG, INJ — เว้นว่างให้สร้างอัตโนมัติ" : undefined}>
                                <Input value={serviceCode} onChange={e => setServiceCode(e.target.value)} placeholder="auto" className={`${FORM_INPUT_CLS} font-mono`} />
                            </FieldRow>
                            <FieldRow label="ประเภท" required>
                                <select
                                    value={itemType}
                                    onChange={e => setItemType(e.target.value as ServiceItemType)}
                                    className={FORM_SELECT_CLS}
                                >
                                    {SERVICE_ITEM_TYPE_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </FieldRow>

                            <FieldRow label="แผนก (รายได้)" required>
                                <select value={segment} onChange={e => setSegment(e.target.value)} className={FORM_SELECT_CLS}>
                                    <option value="medical">การแพทย์ (Medical)</option>
                                    <option value="aesthetic">ความงาม (Aesthetic)</option>
                                    <option value="product">ขายของ (Product)</option>
                                </select>
                            </FieldRow>

                            <FieldRow label="ชื่อรายการ" required colSpan={2}>
                                <Input
                                    value={serviceName}
                                    onChange={e => setServiceName(e.target.value)}
                                    placeholder="เช่น ตรวจคลื่นหัวใจ (EKG)"
                                    className={FORM_INPUT_CLS}
                                    autoFocus
                                />
                            </FieldRow>

                            <FieldRow label="ราคา (฿)" required>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={sellingPrice}
                                        onChange={e => setSellingPrice(e.target.value)}
                                        placeholder="0.00"
                                        className={`${FORM_INPUT_CLS} pl-7 text-right tabular-nums font-bold`}
                                    />
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">฿</span>
                                </div>
                            </FieldRow>
                            <FieldRow label="เวลา (นาที)">
                                <Input
                                    type="number"
                                    min="0"
                                    value={durationMin}
                                    onChange={e => setDurationMin(e.target.value)}
                                    placeholder="30"
                                    className={`${FORM_INPUT_CLS} text-right tabular-nums`}
                                />
                            </FieldRow>

                            <FieldRow label="หมายเหตุ" colSpan={2} align="start">
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    rows={2}
                                    placeholder="รายละเอียดเพิ่มเติม..."
                                    className="w-full text-[16px] rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                                />
                            </FieldRow>
                        </Section>

                        <Section title="ตัดสต๊อก / ชุดตรวจ (kit)" icon={Package} color="indigo">
                            <FieldRow label="ตัดจากคลัง" colSpan={2} hint="เลือกรายการในคลังที่ใช้ต่อการตรวจ 1 ครั้ง (เช่น HIV Rapid Kit) — ตัด stock ตอนรับชำระเงิน">
                                <select value={kitId} onChange={e => setKitId(e.target.value)} className={FORM_SELECT_CLS}>
                                    <option value="">— ไม่ตัดสต๊อก —</option>
                                    {inventory.map(i => (
                                        <option key={i.id} value={i.id}>{i.item_name} (คงเหลือ {i.stock_qty} {i.unit || ""})</option>
                                    ))}
                                </select>
                            </FieldRow>
                            {kitId && (
                                <FieldRow label="จำนวนที่ตัด/ครั้ง">
                                    <Input type="number" min="0" step="0.01" value={consumeQty}
                                        onChange={e => setConsumeQty(e.target.value)}
                                        className={`${FORM_INPUT_CLS} text-right tabular-nums`} />
                                </FieldRow>
                            )}
                        </Section>
                    </HorizontalForm>
                </div>

                <div className="p-5 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/50">
                    <Button variant="outline" onClick={onClose} disabled={submitting} className="rounded-xl h-11 px-6 text-[15px] font-bold">ยกเลิก</Button>
                    <Button
                        onClick={handleSave}
                        disabled={submitting || !serviceName.trim()}
                        className="rounded-xl h-11 px-7 text-[15px] font-bold bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-md shadow-blue-500/25"
                    >
                        {submitting ? "กำลังบันทึก..." : initial ? "บันทึก" : "สร้างรายการ"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
