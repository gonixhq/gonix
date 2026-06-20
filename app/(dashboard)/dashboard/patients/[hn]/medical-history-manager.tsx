"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Loader2, AlertTriangle, Stethoscope, X } from "lucide-react";
import {
    addAllergy, removeAllergy,
    addChronicDisease, removeChronicDisease,
} from "@/lib/actions/patient-history";

interface Allergy {
    id: string;
    allergen_name: string;
    allergen_type: string;
    severity: string;
    reaction?: string | null;
}

interface ChronicDisease {
    id: string;
    disease_name: string;
    disease_code?: string | null;
    is_controlled?: boolean | null;
}

const ALLERGEN_TYPES = [
    { value: "drug", label: "ยา (Drug)" },
    { value: "food", label: "อาหาร (Food)" },
    { value: "environmental", label: "สิ่งแวดล้อม" },
    { value: "latex", label: "ยาง (Latex)" },
    { value: "other", label: "อื่นๆ" },
];

const SEVERITIES = [
    { value: "mild", label: "เล็กน้อย (mild)", color: "bg-yellow-100 text-yellow-700" },
    { value: "moderate", label: "ปานกลาง (moderate)", color: "bg-orange-100 text-orange-700" },
    { value: "severe", label: "รุนแรง (severe)", color: "bg-red-100 text-red-700" },
    { value: "life_threatening", label: "อันตรายถึงชีวิต", color: "bg-red-200 text-red-800 ring-1 ring-red-300" },
];

const severityColor: Record<string, string> = {
    mild: "bg-yellow-100 text-yellow-700",
    moderate: "bg-orange-100 text-orange-700",
    severe: "bg-red-100 text-red-700",
    life_threatening: "bg-red-200 text-red-800 ring-1 ring-red-300",
};

export default function MedicalHistoryManager({
    hn, allergies, chronic,
}: {
    hn: string;
    allergies: Allergy[];
    chronic: ChronicDisease[];
}) {
    const router = useRouter();
    const inputCls = "h-10 rounded-xl border-border/60 bg-white shadow-sm text-sm";
    const selectCls = "flex h-10 w-full rounded-xl border border-border/60 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

    /* ── Allergy form ── */
    const [showAllergy, setShowAllergy] = useState(false);
    const [allergyForm, setAllergyForm] = useState({
        allergen_name: "", allergen_type: "drug", severity: "moderate", reaction: "",
    });
    const [allergyLoading, setAllergyLoading] = useState(false);
    const [allergyError, setAllergyError] = useState("");

    async function handleAddAllergy() {
        if (!allergyForm.allergen_name.trim()) { setAllergyError("กรุณาระบุชื่อสารที่แพ้"); return; }
        setAllergyLoading(true);
        setAllergyError("");
        const res = await addAllergy(hn, {
            allergen_name: allergyForm.allergen_name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            allergen_type: allergyForm.allergen_type as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            severity: allergyForm.severity as any,
            reaction: allergyForm.reaction || undefined,
        });
        setAllergyLoading(false);
        if (!res.success) { setAllergyError(res.error || "เกิดข้อผิดพลาด"); return; }
        setAllergyForm({ allergen_name: "", allergen_type: "drug", severity: "moderate", reaction: "" });
        setShowAllergy(false);
        router.refresh();
    }

    async function handleRemoveAllergy(id: string) {
        if (!confirm("ลบรายการแพ้นี้?")) return;
        const res = await removeAllergy(id, hn);
        if (!res.success) { alert(res.error || "ลบไม่สำเร็จ"); return; }
        router.refresh();
    }

    /* ── Chronic disease form ── */
    const [showDisease, setShowDisease] = useState(false);
    const [diseaseForm, setDiseaseForm] = useState({
        disease_name: "", is_controlled: "" as "" | "true" | "false",
    });
    const [diseaseLoading, setDiseaseLoading] = useState(false);
    const [diseaseError, setDiseaseError] = useState("");

    async function handleAddDisease() {
        if (!diseaseForm.disease_name.trim()) { setDiseaseError("กรุณาระบุชื่อโรค"); return; }
        setDiseaseLoading(true);
        setDiseaseError("");
        const res = await addChronicDisease(hn, {
            disease_name: diseaseForm.disease_name,
            is_controlled: diseaseForm.is_controlled === "" ? null : diseaseForm.is_controlled === "true",
        });
        setDiseaseLoading(false);
        if (!res.success) { setDiseaseError(res.error || "เกิดข้อผิดพลาด"); return; }
        setDiseaseForm({ disease_name: "", is_controlled: "" });
        setShowDisease(false);
        router.refresh();
    }

    async function handleRemoveDisease(id: string) {
        if (!confirm("ลบโรคประจำตัวนี้?")) return;
        const res = await removeChronicDisease(id, hn);
        if (!res.success) { alert(res.error || "ลบไม่สำเร็จ"); return; }
        router.refresh();
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ─── Allergies ─── */}
            <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                <div className="bg-red-50/50 border-b px-5 py-3 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600" /> ประวัติแพ้
                    </h3>
                    {!showAllergy && (
                        <Button size="sm" variant="outline" className="rounded-lg gap-1.5 h-8 text-xs"
                            onClick={() => { setShowAllergy(true); setAllergyError(""); }}>
                            <Plus className="h-3.5 w-3.5" /> เพิ่ม
                        </Button>
                    )}
                </div>

                {/* Add form */}
                {showAllergy && (
                    <div className="p-4 bg-red-50/30 border-b space-y-3">
                        {allergyError && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">{allergyError}</p>}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500">ชื่อสารที่แพ้ <span className="text-red-500">*</span></Label>
                            <Input value={allergyForm.allergen_name} className={inputCls}
                                onChange={e => setAllergyForm(p => ({ ...p, allergen_name: e.target.value }))}
                                placeholder="เช่น Penicillin, อาหารทะเล" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500">ประเภท</Label>
                                <select value={allergyForm.allergen_type} className={selectCls}
                                    onChange={e => setAllergyForm(p => ({ ...p, allergen_type: e.target.value }))}>
                                    {ALLERGEN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500">ระดับความรุนแรง</Label>
                                <select value={allergyForm.severity} className={selectCls}
                                    onChange={e => setAllergyForm(p => ({ ...p, severity: e.target.value }))}>
                                    {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500">อาการที่เกิด (ไม่บังคับ)</Label>
                            <Input value={allergyForm.reaction} className={inputCls}
                                onChange={e => setAllergyForm(p => ({ ...p, reaction: e.target.value }))}
                                placeholder="เช่น ผื่นคัน, หายใจลำบาก" />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={handleAddAllergy} disabled={allergyLoading}
                                className="rounded-lg gap-1.5 flex-1">
                                {allergyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                บันทึก
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowAllergy(false)} className="rounded-lg">
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* List */}
                <div className="p-4">
                    {allergies.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">ไม่มีประวัติแพ้</p>
                    ) : (
                        <div className="space-y-2">
                            {allergies.map(a => (
                                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60 border border-slate-200/50 group">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-sm text-slate-800">{a.allergen_name}</div>
                                        <div className="text-xs text-slate-500">{a.allergen_type}{a.reaction ? ` · ${a.reaction}` : ""}</div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${severityColor[a.severity] || "bg-red-100 text-red-700"}`}>
                                            {a.severity}
                                        </span>
                                        <button onClick={() => handleRemoveAllergy(a.id)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                                            title="ลบ">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Chronic Diseases ─── */}
            <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                <div className="bg-blue-50/50 border-b px-5 py-3 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-blue-600" /> โรคประจำตัว
                    </h3>
                    {!showDisease && (
                        <Button size="sm" variant="outline" className="rounded-lg gap-1.5 h-8 text-xs"
                            onClick={() => { setShowDisease(true); setDiseaseError(""); }}>
                            <Plus className="h-3.5 w-3.5" /> เพิ่ม
                        </Button>
                    )}
                </div>

                {/* Add form */}
                {showDisease && (
                    <div className="p-4 bg-blue-50/30 border-b space-y-3">
                        {diseaseError && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">{diseaseError}</p>}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500">ชื่อโรค <span className="text-red-500">*</span></Label>
                            <Input value={diseaseForm.disease_name} className={inputCls}
                                onChange={e => setDiseaseForm(p => ({ ...p, disease_name: e.target.value }))}
                                placeholder="เช่น เบาหวาน, ความดันโลหิตสูง" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500">การควบคุมอาการ</Label>
                            <select value={diseaseForm.is_controlled} className={selectCls}
                                onChange={e => setDiseaseForm(p => ({ ...p, is_controlled: e.target.value as "" | "true" | "false" }))}>
                                <option value="">-- ไม่ระบุ --</option>
                                <option value="true">Controlled (คุมได้)</option>
                                <option value="false">Uncontrolled (คุมไม่ได้)</option>
                            </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={handleAddDisease} disabled={diseaseLoading}
                                className="rounded-lg gap-1.5 flex-1">
                                {diseaseLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                บันทึก
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowDisease(false)} className="rounded-lg">
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* List */}
                <div className="p-4">
                    {chronic.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">ไม่มีโรคประจำตัว</p>
                    ) : (
                        <div className="space-y-2">
                            {chronic.map(c => (
                                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60 border border-slate-200/50 group">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-sm text-slate-800">{c.disease_name}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {c.disease_code && <span className="text-xs text-slate-400 font-mono">{c.disease_code}</span>}
                                            {c.is_controlled !== null && c.is_controlled !== undefined && (
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${c.is_controlled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                                    {c.is_controlled ? "controlled" : "uncontrolled"}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => handleRemoveDisease(c.id)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 text-red-500 shrink-0"
                                        title="ลบ">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
