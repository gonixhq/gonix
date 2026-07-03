"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    Plus, Search, Package, Sparkles, Calendar, Users,
    CheckCircle, EyeOff, X, Loader2, DollarSign, Clock,
} from "lucide-react";
import { PermissionGate } from "@/components/ui/permission-button";
import { createPackage } from "@/lib/actions/packages";
import { PACKAGE_CATEGORIES } from "@/lib/package-types";

interface PackageRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: string | null;
    total_sessions: number;
    price: number;
    validity_days: number;
    is_active: boolean;
    active_purchases: number;
    total_purchases: number;
    sold_sessions: number;
    used_sessions: number;
    utilization_pct: number;
    expiring_soon: number;
}

const CATEGORY_COLOR: Record<string, string> = {
    HIFU: "bg-rose-100 text-rose-700",
    DRIP: "bg-cyan-100 text-cyan-700",
    FILLER: "bg-purple-100 text-purple-700",
    BOTOX: "bg-indigo-100 text-indigo-700",
    LASER: "bg-amber-100 text-amber-700",
    MESO: "bg-blue-100 text-blue-700",
    FACIAL: "bg-pink-100 text-pink-700",
    BODY: "bg-emerald-100 text-emerald-700",
    OTHER: "bg-slate-100 text-slate-700",
};

export default function PackagesClient({ packages }: { packages: PackageRow[] }) {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<string>("all");
    const [showCreate, setShowCreate] = useState(false);

    const totalActive = useMemo(() => packages.filter(p => p.is_active).length, [packages]);
    const totalActivePurchases = useMemo(() => packages.reduce((s, p) => s + p.active_purchases, 0), [packages]);
    const totalRevenue = useMemo(
        () => packages.reduce((s, p) => s + Number(p.price) * p.total_purchases, 0),
        [packages]
    );
    const categories = useMemo(() => {
        const set = new Set<string>();
        packages.forEach(p => p.category && set.add(p.category));
        return Array.from(set);
    }, [packages]);
    const inactiveCount = useMemo(() => packages.filter(p => !p.is_active).length, [packages]);
    const catCount = useMemo(() => {
        const m: Record<string, number> = {};
        packages.forEach(p => { if (p.is_active && p.category) m[p.category] = (m[p.category] || 0) + 1; });
        return m;
    }, [packages]);

    const filtered = useMemo(() => {
        return packages.filter(p => {
            if (filter === "inactive" && p.is_active) return false;
            if (filter !== "inactive" && filter !== "all" && p.category !== filter) return false;
            if (filter !== "inactive" && !p.is_active) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!p.name.toLowerCase().includes(q) &&
                    !(p.code || "").toLowerCase().includes(q) &&
                    !(p.description || "").toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [packages, search, filter]);

    return (
        <div className="space-y-4 max-w-7xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <Link href="/dashboard/inventory" className="text-slate-400 hover:text-blue-700 transition-colors">
                        คลังสินค้า
                    </Link>
                    <span className="text-slate-300">›</span>
                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                        <Sparkles className="h-4 w-4" />
                        คอสบริการ
                    </span>
                    <span className="text-slate-300">·</span>
                    <span><span className="font-bold text-slate-700 tabular-nums">{totalActive}</span> รายการ</span>
                </p>
                <PermissionGate permKey="inventory.edit">
                    <Button onClick={() => setShowCreate(true)} className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                        <Plus className="h-4 w-4" /> เพิ่มคอส
                    </Button>
                </PermissionGate>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="คอสทั้งหมด" value={totalActive} icon={Package} color="slate" />
                <StatCard label={categories.length <= 1 ? "หมวด" : `หมวด (${categories.length})`} value={categories.length === 0 ? "—" : categories.length === 1 ? categories[0] : categories.length} icon={Sparkles} color="rose" />
                <StatCard label="สิทธิ์ที่ active" value={totalActivePurchases} icon={Users} color="teal" />
                <StatCard label="ยอดขายรวม" value={`฿${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`} icon={DollarSign} color="emerald" />
            </div>

            {/* Search + filter */}
            <div className="gonix-card-premium p-4 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                        type="search"
                        placeholder="ค้นหารหัส, ชื่อคอส..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10 h-10 rounded-xl focus:ring-blue-500/10 focus:border-blue-500"
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>ทั้งหมด ({totalActive})</FilterChip>
                    {categories.map(c => (
                        <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
                            {c} ({catCount[c] || 0})
                        </FilterChip>
                    ))}
                    {inactiveCount > 0 && (
                        <FilterChip active={filter === "inactive"} onClick={() => setFilter("inactive")}>ปิดใช้งาน ({inactiveCount})</FilterChip>
                    )}
                </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="h-7 w-7 text-rose-500" />
                    </div>
                    <h3 className="font-bold text-slate-700">
                        {search ? "ไม่พบคอสที่ค้นหา" : "ยังไม่มีคอสในระบบ"}
                    </h3>
                    {!search && (
                        <p className="text-sm text-slate-500 mt-1">เพิ่มคอสแรก เช่น HIFU 5 ครั้ง / ดริปผิว 3 ครั้ง</p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map(p => (
                        <Link
                            key={p.id}
                            href={`/dashboard/inventory/packages/${p.id}`}
                            className={`gonix-card-premium p-4 hover:shadow-md hover:border-blue-300/60 transition-all group ${!p.is_active ? "opacity-60" : ""}`}
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                            {p.code}
                                        </span>
                                        {p.category && (
                                            <span className="inline-flex items-center gap-1">
                                                <span className="text-[10px] text-slate-400">ประเภท:</span>
                                                <Badge className={`border-0 text-[10px] font-bold uppercase ${CATEGORY_COLOR[p.category] || CATEGORY_COLOR.OTHER}`}>
                                                    {p.category}
                                                </Badge>
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2">
                                        {p.name}
                                    </h3>
                                </div>
                                {p.is_active ? (
                                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                                ) : (
                                    <EyeOff className="h-4 w-4 text-slate-400 shrink-0" />
                                )}
                            </div>

                            {p.description && (
                                <p className="text-xs text-slate-500 line-clamp-2 mb-2">{p.description}</p>
                            )}

                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div className="bg-slate-50 rounded-lg p-2 text-center">
                                    <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">จำนวน</div>
                                    <div className="font-bold text-slate-800 tabular-nums">{p.total_sessions} ครั้ง</div>
                                </div>
                                <div className="bg-blue-50 rounded-lg p-2 text-center">
                                    <div className="text-[10px] text-blue-600 font-medium uppercase tracking-wider">ราคา</div>
                                    <div className="font-bold text-blue-800 tabular-nums">฿{Number(p.price).toLocaleString()}</div>
                                </div>
                            </div>

                            {/* Utilization bar (ครั้งที่ใช้ vs ขายไป รวมทุก user) */}
                            {p.sold_sessions > 0 && (
                                <div className="mt-2">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                                        <span>การใช้งาน</span>
                                        <span className="tabular-nums">{p.used_sessions}/{p.sold_sessions} ครั้ง · {p.utilization_pct}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className={`h-full rounded-full ${p.utilization_pct >= 80 ? "bg-emerald-500" : p.utilization_pct >= 40 ? "bg-blue-500" : "bg-amber-400"}`} style={{ width: `${Math.min(100, p.utilization_pct)}%` }} />
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] flex-wrap gap-1">
                                <span className="text-slate-500 inline-flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> {p.validity_days} วัน
                                </span>
                                <div className="inline-flex items-center gap-1.5">
                                    {p.expiring_soon > 0 && (
                                        <span className="text-amber-700 font-bold inline-flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded" title="ลูกค้าที่คอสใกล้หมดอายุใน 30 วัน ยังใช้ไม่ครบ">
                                            <Clock className="h-3 w-3" /> {p.expiring_soon} ใกล้หมดอายุ
                                        </span>
                                    )}
                                    {p.active_purchases > 0 && (
                                        <span className="text-blue-700 font-bold inline-flex items-center gap-1">
                                            <Users className="h-3 w-3" /> {p.active_purchases} active
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {showCreate && <CreatePackageModal onClose={() => setShowCreate(false)} />}
        </div>
    );
}

function StatCard({
    label, value, icon: Icon, color,
}: {
    label: string;
    value: string | number;
    icon: React.ElementType;
    color: "slate" | "rose" | "teal" | "emerald";
}) {
    const styles = {
        slate: { bg: "bg-slate-50", iconBg: "bg-slate-100", iconText: "text-slate-700", valueText: "text-slate-800" },
        rose: { bg: "bg-rose-50/60", iconBg: "bg-rose-100", iconText: "text-rose-700", valueText: "text-rose-800" },
        teal: { bg: "bg-blue-50/60", iconBg: "bg-blue-100", iconText: "text-blue-700", valueText: "text-blue-800" },
        emerald: { bg: "bg-emerald-50/60", iconBg: "bg-emerald-100", iconText: "text-emerald-700", valueText: "text-emerald-800" },
    }[color];

    return (
        <div className={`rounded-2xl border border-slate-200/60 ${styles.bg} backdrop-blur-md p-4 flex items-center gap-3`}>
            <div className={`h-10 w-10 rounded-xl ${styles.iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 ${styles.iconText}`} />
            </div>
            <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                <div className={`text-xl font-bold ${styles.valueText} tabular-nums truncate`}>{value}</div>
            </div>
        </div>
    );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 h-7 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
        >
            {children}
        </button>
    );
}

function CreatePackageModal({ onClose }: { onClose: () => void }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: "",
        code: "",
        category: "HIFU",
        description: "",
        total_sessions: 5,
        price: 0,
        validity_days: 365,
        sales_commission_pct: 0,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
            const result = await createPackage({
                name: form.name,
                code: form.code || undefined,
                category: form.category,
                description: form.description || undefined,
                total_sessions: Number(form.total_sessions),
                price: Number(form.price),
                validity_days: Number(form.validity_days),
                sales_commission_pct: Number(form.sales_commission_pct) || 0,
                is_active: true,
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
                    <div>
                        <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-rose-500" />
                            เพิ่มคอสบริการ
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">สร้างแพ็คเกจคอสใหม่</p>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">ชื่อคอส *</Label>
                        <Input
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="เช่น HIFU ยกกระชับ 5 ครั้ง"
                            required
                            autoFocus
                            className="rounded-xl"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">รหัส</Label>
                            <Input
                                value={form.code}
                                onChange={e => setForm({ ...form, code: e.target.value })}
                                placeholder="auto"
                                className="rounded-xl font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">หมวด</Label>
                            <select
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value })}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                            >
                                {PACKAGE_CATEGORIES.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">จำนวนครั้ง *</Label>
                            <Input
                                type="number"
                                min={1}
                                value={form.total_sessions}
                                onChange={e => setForm({ ...form, total_sessions: parseInt(e.target.value) || 1 })}
                                className="rounded-xl tabular-nums"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">ราคา (฿) *</Label>
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={form.price}
                                onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                                className="rounded-xl tabular-nums"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">อายุ (วัน)</Label>
                            <Input
                                type="number"
                                min={1}
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
                        <div className="relative">
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                step="0.5"
                                value={form.sales_commission_pct}
                                onChange={e => setForm({ ...form, sales_commission_pct: parseFloat(e.target.value) || 0 })}
                                className="rounded-xl tabular-nums pr-8"
                                placeholder="0"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">%</span>
                        </div>
                        {form.sales_commission_pct > 0 && form.price > 0 && (
                            <p className="text-[11px] text-slate-500">
                                = ฿{(form.price * form.sales_commission_pct / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ต่อการขาย 1 คอส
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">รายละเอียด</Label>
                        <Textarea
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            placeholder="คำอธิบาย / เงื่อนไข"
                            rows={2}
                            className="rounded-xl"
                        />
                    </div>

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3">
                            {error}
                        </div>
                    )}
                </form>

                <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onClose} className="rounded-xl">
                        ยกเลิก
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || !form.name.trim()}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                        บันทึก
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
