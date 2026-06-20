"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Save, Loader2, CheckCircle, Plus, Trash2, Search, Pill, FlaskConical, ChevronDown } from "lucide-react";

interface DrugItem {
    id: string;
    item_name: string;
    generic_name: string | null;
    strength: string | null;
    dosage_form: string | null;
    unit: string | null;
    sell_price: number | null;
    stock_qty: number | null;
    category?: string | null;
    sig_text_default?: string | null;
    dose_qty?: string | null;
    frequency?: string | null;
    use_type?: string | null;
}

interface OrderLine {
    inventoryId: string;
    item_name: string;
    generic_name: string;
    qty: number;
    unit: string;
    sig_text: string;
    cost_per_unit: number;
    total_cost: number;
}

interface Icd10Result {
    code: string;
    description_en: string;
    description_th: string;
}

interface DrugPreset {
    id: string;
    name: string;
    preset_type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
}

interface DrugOrderFormProps {
    vn: string;
    hn: string;
    defaultIcd10?: string;
}

const commonSigs = [
    "รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร",
    "รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง เช้า-เย็น",
    "รับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง ก่อนนอน",
    "รับประทานครั้งละ 2 เม็ด วันละ 3 ครั้ง หลังอาหาร",
    "ทาบริเวณที่เป็น วันละ 2-3 ครั้ง",
    "หยอดตา 1-2 หยด วันละ 3 ครั้ง",
    "เมื่อมีอาการ (prn)",
];

export default function DrugOrderForm({ vn, hn, defaultIcd10 = "" }: DrugOrderFormProps) {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    // ICD-10 search
    const [icd10Query, setIcd10Query] = useState(defaultIcd10);
    const [icd10Results, setIcd10Results] = useState<Icd10Result[]>([]);
    const [showIcd10, setShowIcd10] = useState(false);
    const [selectedIcd10, setSelectedIcd10] = useState<Icd10Result | null>(null);
    const [savingIcd10, setSavingIcd10] = useState(false);

    // Drug formula presets
    const [presets, setPresets] = useState<DrugPreset[]>([]);
    const [showPresets, setShowPresets] = useState(false);

    // Drug item search
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<DrugItem[]>([]);
    const [showSearch, setShowSearch] = useState(false);

    // Order lines
    const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

    // Which row's sig-picker dropdown is open
    const [sigPickerIdx, setSigPickerIdx] = useState<number | null>(null);

    // Load presets on mount + prefill ICD-10 description if code already set
    useEffect(() => {
        supabase.from("supply_presets")
            .select("id, name:preset_name, preset_type, items")
            .in("preset_type", ["drug_formula", "vitamin_formula"])
            .eq("is_active", true)
            .order("preset_type")
            .limit(50)
            .then(({ data }) => { if (data) setPresets(data); });

        // Prefill ICD-10 description if we have just the code
        if (defaultIcd10 && defaultIcd10.length > 0 && !defaultIcd10.includes("—")) {
            supabase.from("icd10")
                .select("code, description_en, description_th")
                .eq("code", defaultIcd10)
                .maybeSingle()
                .then(({ data }) => {
                    if (data) {
                        const desc = data.description_th || data.description_en || "";
                        setIcd10Query(`${data.code} — ${desc}`);
                        setSelectedIcd10(data);
                    }
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ICD-10 search
    const searchIcd10 = useCallback(async (q: string) => {
        setIcd10Query(q);
        setSelectedIcd10(null);
        if (q.length < 2) { setIcd10Results([]); setShowIcd10(false); return; }
        const { data } = await supabase
            .from("icd10")
            .select("code, description_en, description_th")
            .or(`code.ilike.%${q}%,description_en.ilike.%${q}%,description_th.ilike.%${q}%`)
            .limit(8);
        if (data && data.length > 0) { setIcd10Results(data); setShowIcd10(true); }
        else { setIcd10Results([]); setShowIcd10(false); }
    }, [supabase]);

    async function selectIcd10(item: Icd10Result) {
        setSelectedIcd10(item);
        setIcd10Query(`${item.code} — ${item.description_th || item.description_en}`);
        setShowIcd10(false);
        // Save to visits immediately
        setSavingIcd10(true);
        await supabase.from("visits").update({ icd10_primary: item.code }).eq("vn", vn);
        setSavingIcd10(false);
    }

    // Drug search — include drug + supply + sig defaults from inventory
    const searchDrugs = useCallback(async (q: string) => {
        setSearchQuery(q);
        if (q.length < 2) { setSearchResults([]); setShowSearch(false); return; }
        // Try full query with all sig columns; fall back to basic if column doesn't exist
        let { data, error } = await supabase
            .from("inventory")
            .select("id, item_name, generic_name, strength, dosage_form, unit, sell_price, stock_qty, category, sig_text_default, dose_qty, frequency, use_type")
            .eq("is_active", true)
            .in("category", ["drug", "supply"])
            .or(`item_name.ilike.%${q}%,generic_name.ilike.%${q}%`)
            .limit(10);

        // Fallback: basic columns only (in case migration 014 not applied)
        if (error) {
            console.warn("[drug-search] full query failed, falling back to basic columns:", error.message);
            const res = await supabase
                .from("inventory")
                .select("id, item_name, generic_name, strength, dosage_form, unit, sell_price, stock_qty, category")
                .eq("is_active", true)
                .in("category", ["drug", "supply"])
                .or(`item_name.ilike.%${q}%,generic_name.ilike.%${q}%`)
                .limit(10);
            // fallback omits sig columns; keep the same shape (sig fields just absent)
            data = res.data as typeof data;
            error = res.error;
        }

        if (error) {
            console.error("[drug-search] search error:", error);
            setSearchResults([]);
            setShowSearch(false);
            return;
        }
        if (data && data.length > 0) { setSearchResults(data); setShowSearch(true); }
        else { setSearchResults([]); setShowSearch(false); }
    }, [supabase]);

    /** Build sig from inventory fields if sig_text_default is empty */
    function buildSig(drug: DrugItem): string {
        // 1. If sig_text_default exists, use it
        if (drug.sig_text_default && drug.sig_text_default.trim()) {
            return drug.sig_text_default.trim();
        }
        // 2. Try to combine dose_qty + frequency + use_type
        const parts: string[] = [];
        if (drug.dose_qty) parts.push(drug.dose_qty);
        if (drug.frequency) parts.push(drug.frequency);
        if (drug.use_type) parts.push(drug.use_type);
        if (parts.length > 0) return parts.join(" ");
        // 3. Fallback to common default
        return commonSigs[0];
    }

    function addDrug(drug: DrugItem) {
        // ถ้ามียานี้แล้ว → เพิ่ม qty +1 แทนการ add ซ้ำ
        const existing = orderLines.findIndex(l => l.inventoryId === drug.id);
        if (existing >= 0) {
            setOrderLines(prev => prev.map((l, i) => {
                if (i !== existing) return l;
                const newQty = l.qty + 1;
                return { ...l, qty: newQty, total_cost: newQty * l.cost_per_unit };
            }));
        } else {
            setOrderLines(prev => [...prev, {
                inventoryId: drug.id,
                item_name: drug.item_name,
                generic_name: drug.generic_name || "",
                qty: 1,
                unit: drug.unit || "เม็ด",
                sig_text: buildSig(drug),
                cost_per_unit: drug.sell_price || 0,
                total_cost: drug.sell_price || 0,
            }]);
        }
        // Clear search สำหรับยาตัวต่อไป
        setSearchQuery("");
        setSearchResults([]);
        setShowSearch(false);
        setSaved(false);
    }

    // Apply drug formula preset
    async function applyPreset(preset: DrugPreset) {
        setShowPresets(false);
        if (!preset.items || !Array.isArray(preset.items)) return;
        // Fetch inventory details for preset items
        const ids = preset.items.map((i: { inventory_id: string }) => i.inventory_id).filter(Boolean);
        if (ids.length === 0) return;
        const { data } = await supabase
            .from("inventory")
            .select("id, item_name, generic_name, strength, unit, sell_price")
            .in("id", ids);
        if (!data) return;
        const newLines: OrderLine[] = preset.items.map((item: { inventory_id: string; qty?: number; sig_text?: string }) => {
            const inv = data.find(d => d.id === item.inventory_id);
            if (!inv) return null;
            const qty = item.qty || 1;
            return {
                inventoryId: inv.id,
                item_name: inv.item_name,
                generic_name: inv.generic_name || "",
                qty,
                unit: inv.unit || "เม็ด",
                sig_text: item.sig_text || commonSigs[0],
                cost_per_unit: inv.sell_price || 0,
                total_cost: (inv.sell_price || 0) * qty,
            };
        }).filter(Boolean) as OrderLine[];
        setOrderLines(prev => {
            const existingIds = prev.map(l => l.inventoryId);
            const toAdd = newLines.filter(l => !existingIds.includes(l.inventoryId));
            return [...prev, ...toAdd];
        });
        setSaved(false);
    }

    function updateLine(idx: number, field: string, value: string | number) {
        setOrderLines(prev => prev.map((l, i) => {
            if (i !== idx) return l;
            const updated = { ...l, [field]: value };
            if (field === "qty") updated.total_cost = (value as number) * updated.cost_per_unit;
            if (field === "cost_per_unit") updated.total_cost = (value as number) * updated.qty;
            return updated;
        }));
        setSaved(false);
    }

    function removeLine(idx: number) {
        setOrderLines(prev => prev.filter((_, i) => i !== idx));
        setSaved(false);
    }

    const totalAmount = orderLines.reduce((s, l) => s + l.total_cost, 0);

    async function handleSave() {
        if (orderLines.length === 0) return;
        setLoading(true);
        setError("");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
            if (!profile) throw new Error("Profile not found");

            const inserts = orderLines.map(l => ({
                vn, hn,
                clinic_id: profile.clinic_id,
                item_id: l.inventoryId,
                qty: l.qty,
                unit: l.unit,
                sig_text: l.sig_text,
                cost_per_unit: l.cost_per_unit,
                total_cost: l.total_cost,
            }));

            const { error: insertErr } = await supabase.from("drug_orders").insert(inserts);
            if (insertErr) throw insertErr;

            setSaved(true);
            setOrderLines([]);
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-6">

            {/* ── ICD-10 Diagnosis ─────────────────────────────── */}
            <div>
                <p className="text-sm font-bold text-red-600 mb-2 flex items-center gap-1.5">
                    <FlaskConical className="h-4 w-4" />
                    การวินิจฉัยโรค (Diagnosis ICD-10)
                </p>
                <div className="relative">
                    <Input
                        value={icd10Query}
                        onChange={e => searchIcd10(e.target.value)}
                        placeholder="พิมพ์รหัส ICD10 หรือ ชื่อโรค (เช่น J06 หรือ Acute...)"
                        className="pr-10"
                    />
                    {savingIcd10 && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    {selectedIcd10 && !savingIcd10 && <CheckCircle className="absolute right-3 top-2.5 h-4 w-4 text-emerald-600" />}
                    {showIcd10 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-56 overflow-y-auto">
                            {icd10Results.map(item => (
                                <button key={item.code} type="button" onClick={() => selectIcd10(item)}
                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b last:border-0 flex gap-3 items-start">
                                    <span className="font-mono font-bold text-primary text-xs pt-0.5 w-14 shrink-0">{item.code}</span>
                                    <div>
                                        <div className="font-medium text-slate-800">{item.description_th || item.description_en}</div>
                                        {item.description_th && <div className="text-xs text-slate-400">{item.description_en}</div>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Drug Prescription ────────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                        <Pill className="h-4 w-4" />
                        สั่งยา (Prescription)
                    </p>
                    {/* Preset selector */}
                    <div className="relative">
                        <Button variant="outline" size="sm" type="button"
                            onClick={() => setShowPresets(v => !v)}
                            className="text-xs gap-1.5 rounded-xl">
                            <FlaskConical className="h-3.5 w-3.5" />
                            ใช้สูตรยาสำเร็จรูป
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                        {showPresets && (
                            <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-50 w-64 max-h-60 overflow-y-auto">
                                {presets.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-6">ยังไม่มีสูตรยา</p>
                                ) : presets.map(p => (
                                    <button key={p.id} type="button" onClick={() => applyPreset(p)}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 border-b last:border-0">
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Drug search — prominent */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                        value={searchQuery}
                        onChange={e => searchDrugs(e.target.value)}
                        onFocus={() => searchResults.length > 0 && setShowSearch(true)}
                        placeholder="ค้นหายา... (พิมพ์ชื่อ trade หรือ generic name อย่างน้อย 2 ตัวอักษร)"
                        className="pl-11 h-12 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-4 focus-visible:ring-emerald-500/10 focus-visible:border-emerald-500"
                    />
                    {searchQuery && searchQuery.length >= 2 && searchResults.length === 0 && !showSearch && (
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                            ไม่พบยา
                        </span>
                    )}
                    {showSearch && searchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto">
                            {searchResults.map(drug => {
                                const inStock = (drug.stock_qty ?? 0) > 0;
                                const lowStock = inStock && (drug.stock_qty ?? 0) <= 10;
                                return (
                                    <button
                                        key={drug.id}
                                        type="button"
                                        onClick={() => addDrug(drug)}
                                        className="w-full text-left px-4 py-3 hover:bg-emerald-50/60 border-b last:border-0 transition-colors group"
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-bold text-sm text-slate-800 group-hover:text-emerald-700 transition-colors">
                                                        {drug.item_name}
                                                    </span>
                                                    {drug.category === "supply" && (
                                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                                            เวชภัณฑ์
                                                        </span>
                                                    )}
                                                </div>
                                                {(drug.generic_name || drug.strength) && (
                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                        {drug.generic_name} {drug.strength}
                                                        {drug.dosage_form && <span className="ml-1.5 text-slate-400">· {drug.dosage_form}</span>}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${!inStock ? "bg-red-100 text-red-700" : lowStock ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                                    {!inStock ? "หมด" : lowStock ? `เหลือ ${drug.stock_qty}` : `${drug.stock_qty} ${drug.unit || ""}`}
                                                </span>
                                                <span className="font-bold text-emerald-700 text-sm">
                                                    ฿{drug.sell_price?.toLocaleString() || "—"}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Table */}
                <div className="border rounded-md">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-2.5 font-medium text-slate-600">ชื่อยา</th>
                                <th className="text-center px-3 py-2.5 font-medium text-slate-600 w-20">จำนวน</th>
                                <th className="text-left px-3 py-2.5 font-medium text-slate-600">วิธีใช้</th>
                                <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-24">ราคา (฿)</th>
                                <th className="w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderLines.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-slate-400 text-sm">
                                        ยังไม่มีรายการยา — ค้นหายาหรือเลือกสูตรยา
                                    </td>
                                </tr>
                            ) : orderLines.map((line, idx) => (
                                <tr key={line.inventoryId} className="border-b last:border-0 hover:bg-slate-50/50">
                                    <td className="px-4 py-2">
                                        <div className="font-medium">{line.item_name}</div>
                                        {line.generic_name && <div className="text-xs text-slate-400">{line.generic_name}</div>}
                                    </td>
                                    <td className="px-3 py-2">
                                        <Input type="number" min={1} value={line.qty}
                                            onChange={e => updateLine(idx, "qty", parseInt(e.target.value) || 1)}
                                            className="h-8 text-center w-16 mx-auto" />
                                    </td>
                                    <td className="px-3 py-2">
                                        {/* Editable sig with preset picker */}
                                        <div className="relative flex gap-1">
                                            <Input
                                                value={line.sig_text}
                                                onChange={e => updateLine(idx, "sig_text", e.target.value)}
                                                placeholder="วิธีใช้"
                                                className="h-8 text-xs flex-1"
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setSigPickerIdx(sigPickerIdx === idx ? null : idx)}
                                                title="เลือก preset วิธีใช้"
                                                className="h-8 px-2 shrink-0"
                                            >
                                                <ChevronDown className="h-3.5 w-3.5" />
                                            </Button>
                                            {sigPickerIdx === idx && (
                                                <>
                                                    {/* Backdrop for outside-click close */}
                                                    <div
                                                        className="fixed inset-0 z-40"
                                                        onClick={() => setSigPickerIdx(null)}
                                                    />
                                                    <div className="absolute right-0 top-9 mt-0.5 bg-white border rounded-xl shadow-lg z-50 w-72 max-h-56 overflow-y-auto">
                                                        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b bg-slate-50/60">
                                                            เลือก preset วิธีใช้
                                                        </div>
                                                        {commonSigs.map(s => (
                                                            <button
                                                                key={s}
                                                                type="button"
                                                                onClick={() => { updateLine(idx, "sig_text", s); setSigPickerIdx(null); }}
                                                                className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 border-b last:border-0 transition-colors"
                                                            >
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-slate-700">
                                        ฿{line.total_cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-2 py-2">
                                        <button type="button" onClick={() => removeLine(idx)}
                                            className="text-red-400 hover:text-red-600 p-1">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {orderLines.length > 0 && (
                            <tfoot className="bg-slate-50 border-t">
                                <tr>
                                    <td colSpan={3} className="px-4 py-2.5 text-sm text-slate-500">รวมค่ายาเบื้องต้น</td>
                                    <td className="px-3 py-2.5 text-right font-bold text-red-600" colSpan={2}>
                                        {totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                        {orderLines.length === 0 && (
                            <tfoot className="bg-slate-50 border-t">
                                <tr>
                                    <td colSpan={3} className="px-4 py-2.5 text-sm text-slate-400">รวมค่ายาเบื้องต้น</td>
                                    <td className="px-3 py-2.5 text-right font-bold text-red-500 text-sm" colSpan={2}>0.00 ฿</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

                {orderLines.length > 0 && (
                    <div className="flex justify-end pt-2">
                        <Button onClick={handleSave} disabled={loading} size="sm">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> :
                                saved ? <CheckCircle className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                            {saved ? "บันทึกแล้ว" : "บันทึกคำสั่งยา"}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
