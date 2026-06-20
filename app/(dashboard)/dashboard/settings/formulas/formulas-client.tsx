"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    Pill, Syringe, Plus, Pencil, Trash2, X, Loader2, Save, FlaskConical, AlertTriangle,
} from "lucide-react";
import {
    createPreset, updatePreset, deletePreset,
    type PresetRow, type PresetInvPick, type PresetItem,
} from "@/lib/actions/presets";

const TYPES = [
    { value: "drug_formula", label: "สูตรยา", icon: Pill, tile: "bg-amber-100 text-amber-600", accent: "#D97706" },
    { value: "vitamin_formula", label: "สูตรวิตามิน / IV", icon: Syringe, tile: "bg-[#0EA5A0]/10 text-[#0EA5A0]", accent: "#0EA5A0" },
] as const;
const typeMeta = (t: string) => TYPES.find((x) => x.value === t) || TYPES[0];

export default function FormulasClient({ presets, inventory }: { presets: PresetRow[]; inventory: PresetInvPick[] }) {
    const router = useRouter();
    const [tab, setTab] = useState<string>("drug_formula");
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<PresetRow | null>(null);
    const [confirmDel, setConfirmDel] = useState<PresetRow | null>(null);
    const [busy, startBusy] = useTransition();

    const invName = useMemo(() => new Map(inventory.map((i) => [i.id, i.item_name])), [inventory]);
    const filtered = useMemo(() => presets.filter((p) => p.preset_type === tab), [presets, tab]);

    function openNew() { setEditing(null); setShowForm(true); }
    function openEdit(p: PresetRow) { setEditing(p); setShowForm(true); }

    return (
        <div className="space-y-4 max-w-4xl mx-auto animate-fade-in pb-12">
            {/* Header */}
            <div className="gonix-card-premium p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl flex items-center justify-center bg-[#2B54F0]/10 shrink-0">
                        <FlaskConical className="h-5 w-5 text-[#2B54F0]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight leading-tight">สูตรยา / สูตรวิตามิน</h1>
                        <p className="text-xs text-slate-500 mt-0.5">ตั้งค่าชุดยา/วิตามินสำเร็จรูป — หน้าสั่งยาดึงไปใช้ได้เลย</p>
                    </div>
                </div>
                <button onClick={openNew}
                    className="h-10 px-4 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white shadow-sm"
                    style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                    <Plus className="h-4 w-4" /> เพิ่มสูตร
                </button>
            </div>

            {/* Tabs */}
            <div className="inline-flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
                {TYPES.map((t) => {
                    const Icon = t.icon;
                    const count = presets.filter((p) => p.preset_type === t.value).length;
                    return (
                        <button key={t.value} onClick={() => setTab(t.value)}
                            className={`h-9 px-4 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 transition-all ${tab === t.value ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600"}`}>
                            <Icon className="h-4 w-4" /> {t.label} <span className="text-xs text-slate-400">({count})</span>
                        </button>
                    );
                })}
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="gonix-card-premium text-center py-14 text-slate-400">
                    <FlaskConical className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">ยังไม่มี{typeMeta(tab).label} — กด “เพิ่มสูตร”</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filtered.map((p) => {
                        const m = typeMeta(p.preset_type);
                        const Icon = m.icon;
                        return (
                            <div key={p.id} className="gonix-card-premium p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${m.tile}`}><Icon className="h-5 w-5" /></div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-800 truncate">{p.preset_name}</div>
                                            <div className="text-[11px] text-slate-400">{p.items.length} รายการ</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => openEdit(p)} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"><Pencil className="h-4 w-4" /></button>
                                        <button onClick={() => setConfirmDel(p)} className="h-8 w-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {p.items.slice(0, 6).map((it, i) => (
                                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                            {invName.get(it.inventory_id) || "—"}{it.qty > 1 ? ` ×${it.qty}` : ""}
                                        </span>
                                    ))}
                                    {p.items.length > 6 && <span className="text-[11px] text-slate-400">+{p.items.length - 6}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showForm && (
                <FormulaModal
                    initial={editing} defaultType={tab} inventory={inventory}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); router.refresh(); }}
                />
            )}

            {confirmDel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setConfirmDel(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-5 w-5 text-rose-600" /><h3 className="font-bold text-slate-800">ลบสูตร</h3></div>
                        <p className="text-sm text-slate-600 mb-4">ลบ “{confirmDel.preset_name}” ?</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setConfirmDel(null)} className="h-9 px-4 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
                            <button disabled={busy} onClick={() => startBusy(async () => { await deletePreset(confirmDel.id); setConfirmDel(null); router.refresh(); })}
                                className="h-9 px-4 rounded-lg bg-rose-600 text-white text-sm font-bold disabled:opacity-50">ลบ</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function FormulaModal({ initial, defaultType, inventory, onClose, onSaved }: {
    initial: PresetRow | null; defaultType: string; inventory: PresetInvPick[];
    onClose: () => void; onSaved: () => void;
}) {
    const [name, setName] = useState(initial?.preset_name || "");
    const [type, setType] = useState(initial?.preset_type || defaultType);
    const [items, setItems] = useState<PresetItem[]>(initial?.items?.length ? initial.items : [{ inventory_id: "", qty: 1, sig_text: "" }]);
    const [err, setErr] = useState("");
    const [busy, startBusy] = useTransition();

    const setItem = (i: number, patch: Partial<PresetItem>) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));
    const addRow = () => setItems((p) => [...p, { inventory_id: "", qty: 1, sig_text: "" }]);
    const removeRow = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

    function save() {
        setErr("");
        startBusy(async () => {
            const payload = { preset_name: name, preset_type: type, items };
            const res = initial ? await updatePreset(initial.id, payload) : await createPreset(payload);
            if (res.ok) onSaved();
            else setErr(res.error || "บันทึกไม่สำเร็จ");
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <h2 className="font-bold text-lg text-slate-800">{initial ? "แก้ไขสูตร" : "เพิ่มสูตรใหม่"}</h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="h-4 w-4 text-slate-500" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                            <label className="text-xs font-semibold text-slate-600 mb-1 block">ชื่อสูตร *</label>
                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สูตรหวัด, วิตามินผิวใส"
                                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#2B54F0] focus:outline-none" autoFocus />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block">หมวด</label>
                            <select value={type} onChange={(e) => setType(e.target.value)}
                                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm focus:border-[#2B54F0] focus:outline-none">
                                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-semibold text-slate-600">รายการในสูตร *</label>
                            <button onClick={addRow} className="text-xs font-bold text-[#2B54F0] inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> เพิ่มรายการ</button>
                        </div>
                        <div className="space-y-2">
                            {items.map((it, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <select value={it.inventory_id} onChange={(e) => setItem(i, { inventory_id: e.target.value })}
                                        className="flex-1 min-w-0 h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-[#2B54F0] focus:outline-none">
                                        <option value="">— เลือกยา/วิตามิน —</option>
                                        {inventory.map((inv) => <option key={inv.id} value={inv.id}>{inv.item_name}</option>)}
                                    </select>
                                    <input type="number" min={1} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) || 1 })}
                                        className="w-16 h-10 rounded-lg border border-slate-200 px-2 text-sm text-center tabular-nums focus:border-[#2B54F0] focus:outline-none" />
                                    <input value={it.sig_text} onChange={(e) => setItem(i, { sig_text: e.target.value })} placeholder="วิธีใช้ (ไม่บังคับ)"
                                        className="flex-1 min-w-0 h-10 rounded-lg border border-slate-200 px-2.5 text-sm focus:border-[#2B54F0] focus:outline-none" />
                                    <button onClick={() => removeRow(i)} className="h-9 w-9 rounded-lg hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-600 shrink-0"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {err && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{err}</p>}
                </div>

                <div className="border-t border-slate-100 p-4 flex justify-end gap-2">
                    <button onClick={onClose} className="h-10 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
                    <button onClick={save} disabled={busy || !name.trim()}
                        className="h-10 px-5 rounded-xl text-sm font-bold text-white shadow-sm inline-flex items-center gap-1.5 disabled:opacity-60"
                        style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกสูตร
                    </button>
                </div>
            </div>
        </div>
    );
}
