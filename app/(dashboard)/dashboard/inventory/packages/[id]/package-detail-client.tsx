"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    ChevronLeft, Sparkles, Edit3, Calendar, DollarSign,
    Users, Pencil, X, Loader2, CheckCircle, XCircle,
    Trash2, AlertCircle,
} from "lucide-react";
import { updatePackage, deletePackage } from "@/lib/actions/packages";
import { PACKAGE_CATEGORIES, PACKAGE_STATUS_LABEL, PACKAGE_STATUS_COLOR, type PackageStatus } from "@/lib/package-types";

interface PackageItem {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: string | null;
    total_sessions: number;
    price: number;
    validity_days: number;
    is_active: boolean;
    created_at: string;
    sales_commission_pct?: number | null;
}

interface Purchase {
    id: string;
    hn: string;
    package_name: string;
    total_sessions: number;
    used_sessions: number;
    paid_amount: number;
    purchased_at: string;
    expires_at: string;
    status: PackageStatus;
    invoice_id: string | null;
    patient: {
        first_name: string;
        last_name: string;
        prefix: string | null;
        phone: string | null;
    } | null;
}

export default function PackageDetailClient({
    pkg, purchases,
}: { pkg: PackageItem; purchases: Purchase[] }) {
    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);

    const activePurchases = useMemo(() => purchases.filter(p => p.status === "active"), [purchases]);
    const totalRevenue = useMemo(() => purchases.reduce((s, p) => s + Number(p.paid_amount || 0), 0), [purchases]);
    const totalSessionsUsed = useMemo(() => purchases.reduce((s, p) => s + (p.used_sessions || 0), 0), [purchases]);
    const totalSessionsSold = useMemo(() => purchases.reduce((s, p) => s + (p.total_sessions || 0), 0), [purchases]);

    return (
        <div className="space-y-4 max-w-7xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <Link href="/dashboard/inventory" className="text-slate-400 hover:text-blue-700 transition-colors">
                        คลังสินค้า
                    </Link>
                    <span className="text-slate-300">›</span>
                    <Link href="/dashboard/inventory/packages" className="text-slate-400 hover:text-blue-700 transition-colors">
                        คอสบริการ
                    </Link>
                    <span className="text-slate-300">›</span>
                    <span className="font-bold text-blue-700">{pkg.code}</span>
                </p>
                <Link href="/dashboard/inventory/packages">
                    <Button variant="outline" className="rounded-xl h-9 gap-1">
                        <ChevronLeft className="h-4 w-4" /> กลับ
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main info */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="gonix-card-premium p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                        {pkg.code}
                                    </span>
                                    {pkg.category && (
                                        <Badge className="border-0 bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">
                                            {pkg.category}
                                        </Badge>
                                    )}
                                    {pkg.is_active ? (
                                        <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">
                                            <CheckCircle className="h-3 w-3 mr-1" /> เปิดใช้งาน
                                        </Badge>
                                    ) : (
                                        <Badge className="border-0 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase">
                                            <XCircle className="h-3 w-3 mr-1" /> ปิดใช้งาน
                                        </Badge>
                                    )}
                                </div>
                                <h1 className="text-xl font-bold text-slate-800">{pkg.name}</h1>
                                {pkg.description && (
                                    <p className="text-sm text-slate-600 mt-2">{pkg.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <Button onClick={() => setShowEdit(true)} variant="outline" className="rounded-xl h-9 gap-1">
                                    <Pencil className="h-3.5 w-3.5" /> แก้ไข
                                </Button>
                                <Button onClick={() => setShowDelete(true)} variant="outline" className="rounded-xl h-9 w-9 p-0 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-4">
                            <InfoBox icon={Sparkles} label="จำนวนครั้ง" value={`${pkg.total_sessions} ครั้ง`} color="rose" />
                            <InfoBox icon={DollarSign} label="ราคา" value={`฿${Number(pkg.price).toLocaleString()}`} color="teal" />
                            <InfoBox icon={Calendar} label="อายุการใช้งาน" value={`${pkg.validity_days} วัน`} color="sky" />
                        </div>
                    </div>

                    {/* Purchases */}
                    <div className="gonix-card-premium">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                <Users className="h-4 w-4 text-blue-600" />
                                ผู้ซื้อคอสนี้
                                <span className="text-sm font-normal text-slate-500">({purchases.length})</span>
                            </h2>
                        </div>
                        {purchases.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                <Users className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                                <p className="text-sm">ยังไม่มีคนซื้อคอสนี้</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2.5">HN / ชื่อ</th>
                                            <th className="text-center px-4 py-2.5">ใช้ไป</th>
                                            <th className="text-right px-4 py-2.5">ยอด</th>
                                            <th className="text-left px-4 py-2.5">ซื้อเมื่อ</th>
                                            <th className="text-left px-4 py-2.5">หมดอายุ</th>
                                            <th className="text-center px-4 py-2.5">สถานะ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purchases.map(p => {
                                            const expired = new Date(p.expires_at) < new Date();
                                            const fullName = p.patient
                                                ? `${p.patient.prefix || ""} ${p.patient.first_name} ${p.patient.last_name}`.trim()
                                                : "—";
                                            return (
                                                <tr
                                                    key={p.id}
                                                    className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer"
                                                    onClick={() => window.location.href = `/dashboard/patients/${p.hn}`}
                                                >
                                                    <td className="px-4 py-2.5">
                                                        <div className="font-bold text-slate-800">{fullName}</div>
                                                        <div className="text-[11px] text-slate-500 font-mono">{p.hn}</div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <div className="font-bold tabular-nums text-slate-800">
                                                            {p.used_sessions}/{p.total_sessions}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">
                                                            เหลือ {p.total_sessions - p.used_sessions}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-700">
                                                        ฿{Number(p.paid_amount).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-[11px] text-slate-600">
                                                        {new Date(p.purchased_at).toLocaleDateString("th-TH")}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-[11px]">
                                                        <span className={expired && p.status === "active" ? "text-rose-600 font-bold" : "text-slate-600"}>
                                                            {new Date(p.expires_at).toLocaleDateString("th-TH")}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <Badge className={`border-0 text-[10px] font-bold uppercase ${PACKAGE_STATUS_COLOR[p.status]}`}>
                                                            {PACKAGE_STATUS_LABEL[p.status]}
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    <div className="gonix-card-premium p-4">
                        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">สรุป</h2>
                        <div className="space-y-2.5">
                            <SidebarStat icon={Users} label="ผู้ซื้อทั้งหมด" value={`${purchases.length} คน`} />
                            <SidebarStat icon={CheckCircle} label="สิทธิ์ active" value={`${activePurchases.length} คน`} color="teal" />
                            <SidebarStat icon={Sparkles} label="ครั้งใช้/ขาย" value={`${totalSessionsUsed}/${totalSessionsSold}`} />
                            <SidebarStat icon={DollarSign} label="ยอดขายรวม" value={`฿${totalRevenue.toLocaleString()}`} color="emerald" />
                        </div>
                    </div>

                    <div className="gonix-card-premium p-4">
                        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">ข้อมูลทั่วไป</h2>
                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-500">สร้างเมื่อ</span>
                                <span className="text-slate-700 font-medium">
                                    {new Date(pkg.created_at).toLocaleDateString("th-TH")}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showEdit && <EditPackageModal pkg={pkg} onClose={() => setShowEdit(false)} />}
            {showDelete && <DeletePackageModal pkg={pkg} onClose={() => setShowDelete(false)} />}
        </div>
    );
}

function InfoBox({ icon: Icon, label, value, color }: {
    icon: React.ElementType;
    label: string;
    value: string;
    color: "rose" | "teal" | "sky";
}) {
    const styles = {
        rose: "bg-rose-50 border-rose-200/60 text-rose-700",
        teal: "bg-blue-50 border-blue-200/60 text-blue-700",
        sky: "bg-cyan-50 border-cyan-200/60 text-cyan-700",
    }[color];

    return (
        <div className={`rounded-xl border ${styles} p-3 text-center`}>
            <Icon className="h-4 w-4 mx-auto mb-1 opacity-70" />
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
            <div className="font-bold text-base tabular-nums">{value}</div>
        </div>
    );
}

function SidebarStat({ icon: Icon, label, value, color = "slate" }: {
    icon: React.ElementType;
    label: string;
    value: string;
    color?: "slate" | "teal" | "emerald";
}) {
    const colorMap = {
        slate: "text-slate-700",
        teal: "text-blue-700",
        emerald: "text-emerald-700",
    };
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 inline-flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {label}
            </span>
            <span className={`font-bold tabular-nums ${colorMap[color]}`}>{value}</span>
        </div>
    );
}

function EditPackageModal({ pkg, onClose }: { pkg: PackageItem; onClose: () => void }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: pkg.name,
        code: pkg.code,
        category: pkg.category || "OTHER",
        description: pkg.description || "",
        total_sessions: pkg.total_sessions,
        price: Number(pkg.price),
        validity_days: pkg.validity_days,
        is_active: pkg.is_active,
        sales_commission_pct: Number(pkg.sales_commission_pct || 0),
    });

    const handleSubmit = () => {
        setError(null);
        startTransition(async () => {
            const result = await updatePackage(pkg.id, {
                name: form.name,
                code: form.code,
                category: form.category,
                description: form.description,
                total_sessions: Number(form.total_sessions),
                price: Number(form.price),
                validity_days: Number(form.validity_days),
                is_active: form.is_active,
                sales_commission_pct: Number(form.sales_commission_pct) || 0,
            });
            if (result.success) {
                router.refresh();
                onClose();
            } else {
                setError(result.error || "เกิดข้อผิดพลาด");
            }
        });
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Edit3 className="h-5 w-5 text-cyan-500" />
                        แก้ไขคอส
                    </h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">ชื่อคอส *</Label>
                        <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="rounded-xl" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">รหัส</Label>
                            <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="rounded-xl font-mono" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">หมวด</Label>
                            <select
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value })}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                            >
                                {PACKAGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">จำนวนครั้ง *</Label>
                            <Input
                                type="number" min={1}
                                value={form.total_sessions}
                                onChange={e => setForm({ ...form, total_sessions: parseInt(e.target.value) || 1 })}
                                className="rounded-xl tabular-nums"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">ราคา (฿) *</Label>
                            <Input
                                type="number" min={0} step="0.01"
                                value={form.price}
                                onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                                className="rounded-xl tabular-nums"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">อายุ (วัน)</Label>
                            <Input
                                type="number" min={1}
                                value={form.validity_days}
                                onChange={e => setForm({ ...form, validity_days: parseInt(e.target.value) || 365 })}
                                className="rounded-xl tabular-nums"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                            ค่า Commission เซลล์ (%)
                            <span className="text-[10px] text-slate-400 font-normal normal-case tracking-normal">— % ของราคาที่จ่ายให้คนขาย</span>
                        </Label>
                        <div className="relative max-w-[200px]">
                            <Input
                                type="number" min={0} max={100} step="0.5"
                                value={form.sales_commission_pct}
                                onChange={e => setForm({ ...form, sales_commission_pct: parseFloat(e.target.value) || 0 })}
                                className="rounded-xl tabular-nums pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                        </div>
                        {form.sales_commission_pct > 0 && form.price > 0 && (
                            <p className="text-[11px] text-emerald-700">
                                = ฿{(form.price * form.sales_commission_pct / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ต่อการขาย 1 คอส
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">รายละเอียด</Label>
                        <Textarea
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            rows={2}
                            className="rounded-xl"
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={e => setForm({ ...form, is_active: e.target.checked })}
                            className="h-4 w-4 rounded text-blue-600"
                        />
                        <span className="text-sm text-slate-700">เปิดใช้งาน</span>
                    </label>

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3">{error}</div>
                    )}
                </div>

                <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                    <Button onClick={handleSubmit} disabled={isPending} className="rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white">
                        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                        บันทึก
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function DeletePackageModal({ pkg, onClose }: { pkg: PackageItem; onClose: () => void }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const handleDelete = () => {
        setError(null);
        startTransition(async () => {
            const result = await deletePackage(pkg.id);
            if (result.success) {
                router.push("/dashboard/inventory/packages");
            } else {
                setError(result.error || "เกิดข้อผิดพลาด");
            }
        });
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="p-5">
                    <div className="h-12 w-12 rounded-xl bg-rose-100 flex items-center justify-center mb-3">
                        <AlertCircle className="h-6 w-6 text-rose-600" />
                    </div>
                    <h2 className="font-bold text-lg text-slate-800">ลบคอสนี้?</h2>
                    <p className="text-sm text-slate-600 mt-1">
                        ถ้ามีคนซื้อแล้ว ระบบจะปิดใช้งานแทนการลบ
                    </p>
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                        <div className="font-bold text-slate-800">{pkg.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{pkg.code}</div>
                    </div>
                    {error && (
                        <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3">{error}</div>
                    )}
                </div>
                <div className="p-5 pt-0 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                    <Button onClick={handleDelete} disabled={isPending} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white">
                        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                        ลบคอส
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
