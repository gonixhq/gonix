"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, Save, Loader2, CheckCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import FaceChartCanvas from "./face-chart-canvas";
import { saveTreatmentNotes } from "@/lib/actions/aesthetic";
import type { AestheticRecords } from "@/lib/aesthetic-types";

interface Props {
    vn: string;
    initial: AestheticRecords;
}

// หัตถการที่ใช้บ่อย — กดแล้วแทรกบรรทัด (___ = ช่องให้หมอเติมเลข)
const QUICK_PROCEDURES: { label: string; template: string }[] = [
    { label: "Botox", template: "Botox ___ u บริเวณ ___ (Lot ___ / Exp ___)" },
    { label: "Filler HA", template: "Filler HA ___ ml บริเวณ ___ (Lot ___ / Exp ___)" },
    { label: "HIFU", template: "HIFU ___ shot บริเวณ ___" },
    { label: "Ultraformer", template: "Ultraformer ___ shot บริเวณ ___" },
    { label: "Meso", template: "Mesotherapy ___ บริเวณ ___" },
    { label: "ร้อยไหม", template: "ร้อยไหม ___ เส้น บริเวณ ___" },
    { label: "Laser", template: "Laser ___ บริเวณ ___" },
    { label: "PRP/Rejuran", template: "PRP/Rejuran ___ บริเวณ ___" },
    { label: "Vitamin IV", template: "Vitamin IV/Drip: ___" },
];

type View = "face_chart" | "notes";

export default function AestheticRecordsPanel({ vn, initial }: Props) {
    const router = useRouter();
    const [view, setView] = useState<View>("face_chart");
    const [notes, setNotes] = useState(initial.treatment_notes || "");
    const [savingNotes, setSavingNotes] = useState(false);
    const [notesSaved, setNotesSaved] = useState(false);
    const [, startTransition] = useTransition();

    function insertProcedure(tpl: string) {
        setNotes(prev => (prev.trim() ? prev.replace(/\s*$/, "") + "\n" : "") + "- " + tpl + "\n");
        setNotesSaved(false);
    }

    function handleSaveNotes() {
        setSavingNotes(true);
        startTransition(async () => {
            const result = await saveTreatmentNotes(vn, notes);
            setSavingNotes(false);
            if (result.success) {
                setNotesSaved(true);
                setTimeout(() => setNotesSaved(false), 2000);
                router.refresh();
            } else {
                alert(result.error || "บันทึกไม่สำเร็จ");
            }
        });
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                <div className="h-9 w-9 rounded-xl bg-rose-100 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-800">บันทึกหัตถการความงาม</h2>
                    <p className="text-xs text-slate-500">แผนผังใบหน้า · บันทึกการรักษา</p>
                </div>
            </div>

            {/* View tabs */}
            <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100/70 border border-slate-200/60">
                <ViewTab active={view === "face_chart"} onClick={() => setView("face_chart")} icon={Pencil}>
                    แผนผังใบหน้า
                    {(initial.face_chart?.strokes?.length || 0) + (initial.face_chart?.pins?.length || 0) > 0 && (
                        <span className="ml-1 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                            {(initial.face_chart?.strokes?.length || 0) + (initial.face_chart?.pins?.length || 0)}
                        </span>
                    )}
                </ViewTab>
                <ViewTab active={view === "notes"} onClick={() => setView("notes")} icon={FileText}>
                    บันทึกหัตถการ
                </ViewTab>
            </div>

            {/* Content */}
            {view === "face_chart" && (
                <FaceChartCanvas vn={vn} initial={initial.face_chart} />
            )}

            {view === "notes" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-slate-800">บันทึกการรักษาเพิ่มเติม</h3>
                        <Button
                            onClick={handleSaveNotes}
                            disabled={savingNotes}
                            className="rounded-lg h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
                        >
                            {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> :
                                notesSaved ? <CheckCircle className="h-4 w-4" /> :
                                    <Save className="h-4 w-4" />}
                            {notesSaved ? "บันทึกแล้ว" : "บันทึก"}
                        </Button>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1.5">แตะเพื่อแทรกหัตถการที่ใช้บ่อย (แล้วเติมตัวเลข):</p>
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_PROCEDURES.map(p => (
                                <button key={p.label} type="button" onClick={() => insertProcedure(p.template)}
                                    className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors">
                                    + {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <textarea
                        value={notes}
                        onChange={e => { setNotes(e.target.value); setNotesSaved(false); }}
                        placeholder="บันทึกรายละเอียดการทำหัตถการ เช่น&#10;- ฉีด Filler HA 1ml ที่ Cheek 2 ข้าง&#10;- ฉีด Botox Allergan 50u ที่หน้าผาก&#10;- Lot number, Expiry date&#10;- Pre/Post care instructions..."
                        rows={14}
                        className="w-full text-[15px] rounded-xl border-2 border-slate-200 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none leading-relaxed"
                    />
                    <p className="text-xs text-slate-500">
                        💡 แนะนำให้บันทึก: ชนิดยา/วัสดุ, Lot No, Expiry, จำนวน, จุดที่ฉีด, ผลข้างเคียง, คำแนะนำหลังทำ
                    </p>
                </div>
            )}
        </div>
    );
}

function ViewTab({
    active, onClick, children, icon: Icon,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    icon: React.ElementType;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-xl text-[14px] font-bold transition-all ${
                active
                    ? "bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/25"
                    : "text-slate-600 hover:bg-white"
            }`}
        >
            <Icon className="h-4 w-4" />
            {children}
        </button>
    );
}
