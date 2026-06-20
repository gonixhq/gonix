"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Plus, FlaskConical, Loader2, CheckCircle, Trash2 } from "lucide-react";

interface LabItem {
    id: string;
    name: string;
    price: number;
}

const labCatalog: LabItem[] = [
    { id: "cbc", name: "CBC (Complete Blood Count)", price: 150 },
    { id: "bmp", name: "BMP / Electrolytes", price: 200 },
    { id: "lft", name: "Liver Function Test (LFT)", price: 350 },
    { id: "urine", name: "Urinalysis (UA)", price: 100 },
    { id: "fbs", name: "Fasting Blood Sugar (FBS)", price: 80 },
    { id: "hba1c", name: "HbA1c", price: 250 },
    { id: "lipid", name: "Lipid Profile", price: 350 },
    { id: "tsh", name: "TSH / Free T4", price: 400 },
    { id: "covid", name: "COVID-19 Antigen Test", price: 200 },
    { id: "xray_chest", name: "Chest X-Ray (CXR)", price: 500 },
    { id: "ekg", name: "ตรวจคลื่นหัวใจ (EKG)", price: 300 },
    { id: "usg_abdomen", name: "Ultrasound Abdomen", price: 800 },
];

interface LabOrderFormProps {
    vn: string;
    hn: string;
}

export default function LabOrderForm({ vn, hn }: LabOrderFormProps) {
    const router = useRouter();
    const supabase = createClient();
    const [selected, setSelected] = useState<LabItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    function toggleLab(lab: LabItem) {
        setSelected(prev => prev.find(l => l.id === lab.id)
            ? prev.filter(l => l.id !== lab.id)
            : [...prev, lab]);
        setSaved(false);
    }

    function removeLab(id: string) {
        setSelected(prev => prev.filter(l => l.id !== id));
    }

    async function handleSave() {
        if (selected.length === 0) return;
        setLoading(true);
        setError("");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            // Save as simple JSON to visits table (can be expanded later)
            const labPayload = selected.map(l => ({ id: l.id, name: l.name, price: l.price, status: "pending" }));
            const { error: err } = await supabase.from("visits")
                .update({ soap_a: JSON.stringify(labPayload) })  // temporarily storing in soap_a until lab_orders table is ready
                .eq("vn", vn);

            if (err) throw err;
            setSaved(true);
            router.refresh();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    }

    void hn; // used in future lab_orders insert

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-blue-600" />
                    สั่ง Lab
                </h2>
                {selected.length > 0 && (
                    <Button onClick={handleSave} disabled={loading} size="sm">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> :
                            saved ? <CheckCircle className="h-4 w-4 mr-1.5" /> : null}
                        {saved ? "บันทึกแล้ว" : "บันทึกคำสั่ง Lab"}
                    </Button>
                )}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

            {/* Selected labs */}
            {selected.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-700 mb-2">รายการที่เลือก ({selected.length})</p>
                    {selected.map(l => (
                        <div key={l.id} className="flex items-center justify-between text-sm">
                            <span className="text-slate-700">{l.name}</span>
                            <div className="flex items-center gap-3">
                                <span className="text-slate-500">฿{l.price}</span>
                                <button type="button" onClick={() => removeLab(l.id)} className="text-red-400 hover:text-red-600">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Lab catalog */}
            <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">เลือกรายการ Lab</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {labCatalog.map(lab => {
                        const isSelected = selected.some(l => l.id === lab.id);
                        return (
                            <button key={lab.id} type="button" onClick={() => toggleLab(lab)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-md border text-left text-sm transition-colors ${isSelected
                                    ? "border-blue-500 bg-blue-50 text-blue-800"
                                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
                                <Plus className={`h-4 w-4 shrink-0 ${isSelected ? "text-blue-600 rotate-45" : "text-slate-400"}`} />
                                <span className="flex-1">{lab.name}</span>
                                <span className="text-xs text-slate-400 shrink-0">฿{lab.price}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <p className="text-xs text-slate-400 text-center pt-2">
                * รายการ Lab จะเชื่อมกับระบบ Sub-system ในเวอร์ชันถัดไป
            </p>
        </div>
    );
}
