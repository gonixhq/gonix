"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Plus, Search, PackageOpen, Box, Pill, AlertTriangle,
    DollarSign, Package, CheckCircle, EyeOff, Sparkles, CalendarClock,
    PackageCheck, ClipboardCheck,
} from "lucide-react";
import { PermissionGate } from "@/components/ui/permission-button";

interface InventoryItem {
    id: string;
    item_code: string | null;
    item_name: string;
    generic_name: string | null;
    category: string;
    dosage_form: string | null;
    strength: string | null;
    unit: string;
    stock_qty: number;
    min_stock: number;
    cost_price: number;
    sell_price: number;
    is_active: boolean;
    expiry_date: string | null;
}

const NEAR_EXPIRY_DAYS = 90;
const URGENT_DAYS = 30;
const CRITICAL_DAYS = 7;

type ExpiryKind = "expired" | "critical" | "urgent" | "watch" | "ok" | "none";

/** คืนสถานะวันหมดอายุ 3 ระดับ: expired / critical(≤7) / urgent(≤30) / watch(≤90) / ok / none */
function expiryStatus(expiry: string | null): { kind: ExpiryKind; days: number } {
    if (!expiry) return { kind: "none", days: 0 };
    const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) + "T00:00:00");
    const exp = new Date(expiry + "T00:00:00");
    const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { kind: "expired", days };
    if (days <= CRITICAL_DAYS) return { kind: "critical", days };
    if (days <= URGENT_DAYS) return { kind: "urgent", days };
    if (days <= NEAR_EXPIRY_DAYS) return { kind: "watch", days };
    return { kind: "ok", days };
}

/** สถานะที่ถือว่า "ใกล้/หมดอายุ" (ต้องเตือน) */
function isExpiryAlert(kind: ExpiryKind): boolean {
    return kind === "expired" || kind === "critical" || kind === "urgent" || kind === "watch";
}

const CATEGORY_LABEL: Record<string, string> = {
    drug: "ยา",
    supply: "เวชภัณฑ์",
    service: "บริการ",
    equipment: "อุปกรณ์",
    other: "อื่นๆ",
};

const CATEGORY_COLOR: Record<string, string> = {
    drug: "bg-amber-100 text-amber-700",
    supply: "bg-indigo-100 text-indigo-700",
    service: "bg-blue-100 text-blue-700",
    equipment: "bg-purple-100 text-purple-700",
    other: "bg-slate-100 text-slate-700",
};

type Filter = "all" | "drug" | "supply" | "low" | "expiry" | "inactive";

interface ExpiringLotUI { item_id: string; item_name: string; lot_no: string | null; expiry_date: string; qty_remaining: number; days_left: number; }

export default function InventoryClient({ items, expiring = [] }: { items: InventoryItem[]; expiring?: ExpiringLotUI[] }) {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<Filter>("all");

    const lowStockCount = useMemo(
        () => items.filter(i => i.is_active && i.min_stock > 0 && Number(i.stock_qty) <= Number(i.min_stock)).length,
        [items]
    );

    // นับยา/เวชภัณฑ์ตามระดับความเร่งด่วน (เฉพาะที่ active และมีสต๊อก)
    const expiryCount = useMemo(() => {
        let expired = 0, critical = 0, urgent = 0, watch = 0;
        items.forEach(i => {
            if (!i.is_active || Number(i.stock_qty) <= 0) return;
            const st = expiryStatus(i.expiry_date);
            if (st.kind === "expired") expired++;
            else if (st.kind === "critical") critical++;
            else if (st.kind === "urgent") urgent++;
            else if (st.kind === "watch") watch++;
        });
        return { expired, critical, urgent, watch, total: expired + critical + urgent + watch };
    }, [items]);

    const totalActive = useMemo(() => items.filter(i => i.is_active).length, [items]);
    const drugCount = useMemo(() => items.filter(i => i.is_active && i.category === "drug").length, [items]);
    // มูลค่าสต๊อก (Inventory Value) — คิดจากต้นทุน (cost) ไม่ใช่ราคาขาย
    const totalValue = useMemo(
        () => items.filter(i => i.is_active).reduce((s, i) => s + Number(i.cost_price || 0) * Number(i.stock_qty || 0), 0),
        [items]
    );

    const filtered = useMemo(() => {
        return items.filter(it => {
            // Active filter
            if (filter === "inactive" && it.is_active) return false;
            if (filter !== "inactive" && !it.is_active) return false;
            // Category filter
            if (filter === "drug" && it.category !== "drug") return false;
            if (filter === "supply" && it.category !== "supply") return false;
            // Low stock filter
            if (filter === "low" && !(it.min_stock > 0 && Number(it.stock_qty) <= Number(it.min_stock))) return false;
            // Expiry filter (หมดแล้ว/ใกล้หมด + มีสต๊อก)
            if (filter === "expiry") {
                const st = expiryStatus(it.expiry_date);
                if (!(Number(it.stock_qty) > 0 && isExpiryAlert(st.kind))) return false;
            }
            // Search
            if (search) {
                const q = search.toLowerCase();
                if (!it.item_name.toLowerCase().includes(q) &&
                    !(it.generic_name || "").toLowerCase().includes(q) &&
                    !(it.item_code || "").toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [items, search, filter]);

    return (
        <div className="space-y-4 max-w-7xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                        <Box className="h-4 w-4" />
                        คลังสินค้า/ยา
                    </span>
                    <span className="text-slate-300">·</span>
                    <span><span className="font-bold text-slate-700 tabular-nums">{totalActive}</span> รายการเปิดใช้</span>
                    {lowStockCount > 0 && (
                        <>
                            <span className="text-slate-300">·</span>
                            <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                สต๊อกต่ำ {lowStockCount}
                            </span>
                        </>
                    )}
                    {expiryCount.total > 0 && (
                        <>
                            <span className="text-slate-300">·</span>
                            <span className="inline-flex items-center gap-1 text-orange-700 font-bold">
                                <CalendarClock className="h-3.5 w-3.5" />
                                ใกล้/หมดอายุ {expiryCount.total}
                            </span>
                        </>
                    )}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Link href="/dashboard/inventory/par">
                        <Button variant="outline" className="rounded-xl gap-1.5 h-9 border-blue-200 text-blue-700 hover:bg-blue-50">
                            <PackageCheck className="h-4 w-4" /> เบิกเติม PAR
                        </Button>
                    </Link>
                    <Link href="/dashboard/inventory/stock-count">
                        <Button variant="outline" className="rounded-xl gap-1.5 h-9 border-amber-200 text-amber-700 hover:bg-amber-50">
                            <ClipboardCheck className="h-4 w-4" /> ตรวจนับ
                        </Button>
                    </Link>
                    <Link href="/dashboard/inventory/packages">
                        <Button variant="outline" className="rounded-xl gap-1.5 h-9 border-rose-200 text-rose-700 hover:bg-rose-50">
                            <Sparkles className="h-4 w-4" /> คอสบริการ
                        </Button>
                    </Link>
                    <PermissionGate permKey="inventory.edit">
                        <Link href="/dashboard/inventory/new">
                            <Button className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                                <Plus className="h-4 w-4" /> เพิ่มรายการ
                            </Button>
                        </Link>
                    </PermissionGate>
                </div>
            </div>

            {/* Stat strip (compact) */}
            <div className="gonix-card-premium px-4 py-2.5 flex flex-wrap items-center gap-x-7 gap-y-2.5">
                <StatCard label="รายการทั้งหมด" value={totalActive} icon={Package} color="slate" />
                <StatCard label="สต๊อกต่ำ" value={lowStockCount} icon={AlertTriangle} color="red" highlight={lowStockCount > 0} />
                <StatCard
                    label="ใกล้/หมดอายุ"
                    value={expiryCount.total}
                    icon={CalendarClock}
                    color="orange"
                    highlight={expiryCount.total > 0}
                    sub={expiryCount.expired > 0 ? `หมดแล้ว ${expiryCount.expired}` : undefined}
                />
                <StatCard label="ยา" value={drugCount} icon={Pill} color="amber" />
                <StatCard label="มูลค่าสต๊อก" value={`฿${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`} icon={DollarSign} color="emerald" />
            </div>

            {/* ล็อตใกล้หมดอายุ (≤30 วัน) */}
            {expiring.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <CalendarClock className="h-4 w-4 text-amber-600" />
                        <h3 className="text-sm font-bold text-amber-800">ล็อตใกล้หมดอายุ ({expiring.length}) — ใช้ก่อน</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {expiring.slice(0, 12).map((e, i) => (
                            <Link key={i} href={`/dashboard/inventory/${e.item_id}`} className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 border ${e.days_left < 0 ? "bg-rose-100 border-rose-200 text-rose-700" : "bg-white border-amber-200 text-amber-800"}`}>
                                <span className="font-semibold">{e.item_name}</span>
                                {e.lot_no && <span className="text-slate-400 font-mono">{e.lot_no}</span>}
                                <span className="tabular-nums">· {e.days_left < 0 ? "หมดแล้ว" : `${e.days_left} วัน`}</span>
                            </Link>
                        ))}
                        {expiring.length > 12 && <span className="text-xs text-amber-700 px-2 py-1">+{expiring.length - 12} รายการ</span>}
                    </div>
                </div>
            )}

            {/* Search + filter */}
            <div className="gonix-card-premium p-4 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                        type="search"
                        placeholder="ค้นหารหัส, ชื่อยา, ชื่อสามัญ..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10 h-10 rounded-xl focus:ring-blue-500/10 focus:border-blue-500"
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>ทั้งหมด ({totalActive})</FilterChip>
                    <FilterChip active={filter === "drug"} onClick={() => setFilter("drug")} color="amber">ยา ({drugCount})</FilterChip>
                    <FilterChip active={filter === "supply"} onClick={() => setFilter("supply")} color="indigo">เวชภัณฑ์</FilterChip>
                    {lowStockCount > 0 && (
                        <FilterChip active={filter === "low"} onClick={() => setFilter("low")} color="red">
                            ⚠ สต๊อกต่ำ ({lowStockCount})
                        </FilterChip>
                    )}
                    {expiryCount.total > 0 && (
                        <FilterChip active={filter === "expiry"} onClick={() => setFilter("expiry")} color="orange">
                            ⏰ ใกล้/หมดอายุ ({expiryCount.total})
                        </FilterChip>
                    )}
                    <FilterChip active={filter === "inactive"} onClick={() => setFilter("inactive")} color="slate">ปิดใช้งาน</FilterChip>
                </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <PackageOpen className="h-7 w-7 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-700">
                        {search ? "ไม่พบรายการที่ค้นหา" : "ไม่มีรายการตามตัวกรอง"}
                    </h3>
                </div>
            ) : (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2.5">รหัส</th>
                                    <th className="text-left px-4 py-2.5">ชื่อรายการ</th>
                                    <th className="text-left px-4 py-2.5">หมวด</th>
                                    <th className="text-right px-4 py-2.5">คงเหลือ</th>
                                    <th className="text-left px-4 py-2.5">วันหมดอายุ</th>
                                    <th className="text-right px-4 py-2.5">ราคาขาย</th>
                                    <th className="text-center px-4 py-2.5 w-12">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(it => {
                                    const isLow = it.min_stock > 0 && Number(it.stock_qty) <= Number(it.min_stock);
                                    const exp = expiryStatus(it.expiry_date);
                                    return (
                                        <tr
                                            key={it.id}
                                            className={`border-t border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer ${!it.is_active ? "opacity-50" : ""}`}
                                            onClick={() => window.location.href = `/dashboard/inventory/${it.id}`}
                                        >
                                            <td className="px-4 py-2.5">
                                                <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                    {it.item_code || "—"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="font-bold text-slate-800">
                                                    {it.item_name}
                                                    {it.strength && <span className="text-slate-500 font-normal ml-1">{it.strength}</span>}
                                                </div>
                                                {it.generic_name && (
                                                    <div className="text-[11px] text-slate-500">{it.generic_name}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <Badge className={`border-0 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_COLOR[it.category] || CATEGORY_COLOR.other}`}>
                                                    {CATEGORY_LABEL[it.category] || it.category}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <div className={`font-bold tabular-nums ${isLow ? "text-red-700" : "text-slate-800"}`}>
                                                    {Number(it.stock_qty || 0).toLocaleString()} <span className="text-[11px] text-slate-500 font-normal">{it.unit}</span>
                                                </div>
                                                {isLow && (
                                                    <div className="text-[10px] text-red-600 font-bold inline-flex items-center gap-0.5 mt-0.5">
                                                        <AlertTriangle className="h-2.5 w-2.5" /> Low (min {it.min_stock})
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {it.expiry_date ? (() => {
                                                    const dateCls =
                                                        exp.kind === "expired" || exp.kind === "critical" ? "text-red-700 font-bold"
                                                            : exp.kind === "urgent" ? "text-orange-700 font-bold"
                                                            : exp.kind === "watch" ? "text-yellow-700 font-bold"
                                                            : "text-slate-600";
                                                    const tagCls =
                                                        exp.kind === "expired" || exp.kind === "critical" ? "text-red-600"
                                                            : exp.kind === "urgent" ? "text-orange-600"
                                                            : "text-yellow-600";
                                                    return (
                                                        <div>
                                                            <div className={`text-[13px] tabular-nums ${dateCls}`}>
                                                                {new Date(it.expiry_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                                                            </div>
                                                            {exp.kind === "expired" && (
                                                                <div className="text-[10px] text-red-600 font-bold inline-flex items-center gap-0.5">
                                                                    <CalendarClock className="h-2.5 w-2.5" /> หมดแล้ว {Math.abs(exp.days)} วัน
                                                                </div>
                                                            )}
                                                            {isExpiryAlert(exp.kind) && exp.kind !== "expired" && (
                                                                <div className={`text-[10px] font-bold inline-flex items-center gap-0.5 ${tagCls}`}>
                                                                    <CalendarClock className="h-2.5 w-2.5" /> เหลือ {exp.days} วัน
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })() : (
                                                    <span className="text-[11px] text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-800">
                                                ฿{Number(it.sell_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                {it.is_active ? (
                                                    <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                                                ) : (
                                                    <EyeOff className="h-4 w-4 text-slate-400 mx-auto" />
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({
    label, value, icon: Icon, color, highlight, sub,
}: {
    label: string;
    value: string | number;
    icon: React.ElementType;
    color: "slate" | "amber" | "red" | "emerald" | "orange";
    highlight?: boolean;
    sub?: string;
}) {
    const dim = { tile: "bg-slate-100", iconText: "text-slate-400", valueText: "text-slate-400", glow: "from-slate-200/30 to-slate-100/5" };
    const styles = {
        slate: { tile: "bg-slate-100", iconText: "text-slate-600", valueText: "text-slate-800", glow: "from-slate-200/40 to-slate-100/5" },
        amber: { tile: "bg-amber-100", iconText: "text-amber-600", valueText: "text-slate-800", glow: "from-amber-200/30 to-orange-100/5" },
        red: highlight ? { tile: "bg-red-100", iconText: "text-red-600", valueText: "text-red-700", glow: "from-red-200/30 to-rose-100/5" } : dim,
        orange: highlight ? { tile: "bg-orange-100", iconText: "text-orange-600", valueText: "text-orange-700", glow: "from-orange-200/30 to-amber-100/5" } : dim,
        emerald: { tile: "bg-[#10B981]/10", iconText: "text-[#10B981]", valueText: "text-slate-800", glow: "from-[#15FF83]/25 to-[#10B981]/5" },
    }[color];

    return (
        <div className="flex items-center gap-2.5">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${styles.tile}`}>
                <Icon className={`h-4 w-4 ${styles.iconText}`} strokeWidth={2.5} />
            </div>
            <div className="min-w-0 leading-tight">
                <div className={`text-lg font-extrabold tabular-nums truncate ${styles.valueText}`}>{value}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {label}{sub && <span className="text-red-600 ml-1">· {sub}</span>}
                </div>
            </div>
        </div>
    );
}

function FilterChip({
    active, onClick, children, color = "teal",
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    color?: "teal" | "amber" | "indigo" | "red" | "slate" | "orange";
}) {
    const colorMap = {
        teal: "bg-blue-600 text-white shadow-sm shadow-blue-500/20",
        amber: "bg-amber-600 text-white shadow-sm shadow-amber-500/20",
        indigo: "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20",
        red: "bg-red-600 text-white shadow-sm shadow-red-500/20",
        orange: "bg-orange-600 text-white shadow-sm shadow-orange-500/20",
        slate: "bg-slate-700 text-white shadow-sm",
    };
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                active ? colorMap[color] : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
        >
            {children}
        </button>
    );
}
