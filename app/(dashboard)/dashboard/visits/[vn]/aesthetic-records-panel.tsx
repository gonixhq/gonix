"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, Save, Loader2, CheckCircle, Pencil, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import FaceChartCanvas from "./face-chart-canvas";
import { FaceChartRender } from "@/app/print/visits/[vn]/face-chart-render";
import { saveTreatmentNotes, getPastAestheticRecords } from "@/lib/actions/aesthetic";
import { listActiveServices } from "@/lib/actions/services";
import type { AestheticRecords, PastAestheticVisit } from "@/lib/aesthetic-types";

interface Props {
    vn: string;
    hn: string;
    initial: AestheticRecords;
}

// หัตถการ/ยี่ห้อที่ใช้บ่อย — กดแล้วแทรกบรรทัด (___ = ช่องให้หมอเติมเลข)
const QUICK_GROUPS: { group: string; items: { label: string; template: string }[] }[] = [
    {
        group: "โบทูลินัม",
        items: [
            { label: "Botox (Allergan)", template: "Botox Allergan ___ u บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Dysport", template: "Dysport ___ u บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Xeomin", template: "Xeomin ___ u บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Nabota", template: "Nabota ___ u บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Botulax", template: "Botulax ___ u บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Innotox", template: "Innotox ___ u บริเวณ ___ (Lot ___ / Exp ___)" },
        ],
    },
    {
        group: "ฟิลเลอร์",
        items: [
            { label: "Juvederm", template: "Filler Juvederm ___ ml บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Restylane", template: "Filler Restylane ___ ml บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Neuramis", template: "Filler Neuramis ___ ml บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Belotero", template: "Filler Belotero ___ ml บริเวณ ___ (Lot ___ / Exp ___)" },
        ],
    },
    {
        group: "อื่นๆ",
        items: [
            { label: "HIFU", template: "HIFU ___ shot บริเวณ ___" },
            { label: "Ultraformer", template: "Ultraformer ___ shot บริเวณ ___" },
            { label: "Ulthera", template: "Ulthera ___ shot บริเวณ ___" },
            { label: "Thermage", template: "Thermage ___ shot บริเวณ ___" },
            { label: "Meso", template: "Mesotherapy ___ บริเวณ ___" },
            { label: "ร้อยไหม", template: "ร้อยไหม ___ เส้น บริเวณ ___" },
            { label: "Laser", template: "Laser ___ บริเวณ ___" },
            { label: "Rejuran", template: "Rejuran ___ ml บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "Profhilo", template: "Profhilo ___ ml บริเวณ ___ (Lot ___ / Exp ___)" },
            { label: "PRP", template: "PRP ___ บริเวณ ___" },
            { label: "Vitamin IV", template: "Vitamin IV/Drip: ___" },
        ],
    },
];

type View = "face_chart" | "notes" | "history";

export default function AestheticRecordsPanel({ vn, hn, initial }: Props) {
    const router = useRouter();
    const [view, setView] = useState<View>("face_chart");
    const [pastVisits, setPastVisits] = useState<PastAestheticVisit[] | null>(null);
    const [loadingPast, setLoadingPast] = useState(false);
    function openHistory() {
        setView("history");
        if (pastVisits === null && !loadingPast) {
            setLoadingPast(true);
            getPastAestheticRecords(hn, vn).then(setPastVisits).finally(() => setLoadingPast(false));
        }
    }
    const [notes, setNotes] = useState(initial.treatment_notes || "");
    const [savingNotes, setSavingNotes] = useState(false);
    const [notesSaved, setNotesSaved] = useState(false);
    // รายการความงามที่คลินิกขายจริง (segment=aesthetic จาก service_catalog)
    const [catalogItems, setCatalogItems] = useState<string[]>([]);
    useEffect(() => {
        listActiveServices().then(list => {
            const names = Array.from(new Set(
                (list || [])
                    .filter(s => s.segment === "aesthetic" && s.is_active !== false)
                    .map(s => (s.service_name || "").trim())
                    .filter(n => !!n)
            ));
            setCatalogItems(names);
        }).catch(() => { });
    }, []);
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
                <ViewTab active={view === "history"} onClick={openHistory} icon={History}>
                    ประวัติย้อนหลัง
                    {pastVisits && pastVisits.length > 0 && (
                        <span className="ml-1 px-1.5 rounded-full bg-slate-500 text-white text-[10px] font-bold">{pastVisits.length}</span>
                    )}
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
                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500">
                            {catalogItems.length > 0 ? "แตะเพื่อแทรกรายการที่คลินิกให้บริการ (แล้วเติมตัวเลข):" : "แตะเพื่อแทรกหัตถการ/ยี่ห้อที่ใช้บ่อย (แล้วเติมตัวเลข):"}
                        </p>
                        {catalogItems.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {catalogItems.map(name => (
                                    <button key={name} type="button"
                                        onClick={() => insertProcedure(`${name} จำนวน ___ (Lot ___ / Exp ___)`)}
                                        className="px-2.5 py-1 rounded-lg text-[13px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors">
                                        + {name}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            QUICK_GROUPS.map(g => (
                                <div key={g.group} className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] text-slate-400 w-16 shrink-0">{g.group}</span>
                                    {g.items.map(p => (
                                        <button key={p.label} type="button" onClick={() => insertProcedure(p.template)}
                                            className="px-2.5 py-1 rounded-lg text-[13px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors">
                                            + {p.label}
                                        </button>
                                    ))}
                                </div>
                            ))
                        )}
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

            {view === "history" && (
                <div className="space-y-3">
                    {loadingPast && (
                        <div className="py-8 text-center text-sm text-slate-400">
                            <Loader2 className="h-5 w-5 animate-spin inline mr-1" /> กำลังโหลดประวัติ...
                        </div>
                    )}
                    {!loadingPast && pastVisits && pastVisits.length === 0 && (
                        <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติหัตถการความงามครั้งก่อน</div>
                    )}
                    {!loadingPast && pastVisits?.map(pv => (
                        <div key={pv.vn} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-bold text-slate-800">
                                    {new Date(pv.visit_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                                </div>
                                <span className="text-[11px] font-mono text-slate-400">{pv.vn}</span>
                            </div>
                            {pv.records.treatment_notes?.trim() && (
                                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans bg-slate-50 rounded-lg p-2.5 m-0">{pv.records.treatment_notes}</pre>
                            )}
                            {(pv.records.face_chart?.pins?.length || pv.records.face_chart?.strokes?.length) ? (
                                <div className="flex justify-center"><FaceChartRender data={pv.records.face_chart} width={220} /></div>
                            ) : null}
                            {(pv.records.photos?.before?.length || pv.records.photos?.after?.length) ? (
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        ...(pv.records.photos?.before || []).map(p => ({ url: p.url, tag: "ก่อน" })),
                                        ...(pv.records.photos?.after || []).map(p => ({ url: p.url, tag: "หลัง" })),
                                    ].map((ph, i) => (
                                        <a key={i} href={ph.url} target="_blank" rel="noreferrer" className="relative block">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={ph.url} alt="" className="h-16 w-16 object-cover rounded-lg border border-slate-200" />
                                            <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/50 text-white rounded-b-lg">{ph.tag}</span>
                                        </a>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ))}
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
