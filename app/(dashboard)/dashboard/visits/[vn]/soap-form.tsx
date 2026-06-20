"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Loader2 } from "lucide-react";

interface SoapFormProps {
    vn: string;
    visitType?: string;
    defaultValues: {
        soap_o: string;
        soap_p: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aesthetic_records?: any;
    };
}

export default function SoapForm({ vn, visitType = "opd", defaultValues }: SoapFormProps) {
    const router = useRouter();
    const supabase = createClient();

    const initialAesthetic = defaultValues.aesthetic_records || {};
    const [aestheticValues, setAestheticValues] = useState({
        procedure_name: initialAesthetic.procedure_name || "",
        treated_area: initialAesthetic.treated_area || "",
        lot_number: initialAesthetic.lot_number || "",
        aesthetic_note: initialAesthetic.aesthetic_note || "",
    });
    const aestheticRef = useRef(aestheticValues);

    const [values, setValues] = useState(defaultValues);
    const valuesRef = useRef(values);
    const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    async function saveToDb(newValues: typeof values, newAesthetic: typeof aestheticValues) {
        setStatus("saving");
        try {
            await supabase.from("visits").update({
                soap_o: newValues.soap_o || null,
                soap_p: newValues.soap_p || null,
                aesthetic_records: visitType === "aesthetic" ? newAesthetic : undefined,
            }).eq("vn", vn);
            setStatus("saved");
            router.refresh();
        } catch {
            setStatus("idle");
        }
    }

    function scheduleAutoSave(newValues: typeof values, newAesthetic: typeof aestheticValues) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setStatus("idle");
        debounceRef.current = setTimeout(() => {
            saveToDb(newValues, newAesthetic);
        }, 500);
    }

    function handleChange(key: string, value: string) {
        const updated = { ...values, [key]: value };
        setValues(updated);
        valuesRef.current = updated;
        scheduleAutoSave(updated, aestheticValues);
    }

    function handleAestheticChange(key: string, value: string) {
        const updated = { ...aestheticValues, [key]: value };
        setAestheticValues(updated);
        aestheticRef.current = updated;
        scheduleAutoSave(values, updated);
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                // Save immediately if there are pending changes when unmounting (e.g. switching tabs quickly)
                saveToDb(valuesRef.current, aestheticRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b">
                <h2 className="text-base font-bold text-slate-800">ซักประวัติ &amp; ตรวจร่างกาย (PE)</h2>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 h-6">
                    {status === "saving" && (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังบันทึก...</>
                    )}
                    {status === "saved" && (
                        <><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> <span className="text-emerald-600">บันทึกแล้ว</span></>
                    )}
                </div>
            </div>

            <div className="space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="soap_o" className="text-sm font-semibold text-slate-700">
                        บันทึกผลการตรวจร่างกาย (Physical Examination)
                    </Label>
                    <textarea
                        id="soap_o"
                        value={values.soap_o}
                        onChange={(e) => handleChange("soap_o", e.target.value)}
                        rows={5}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-sm"
                        placeholder="บันทึกผลการตรวจร่างกาย (Physical Examination)..."
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="soap_p" className="text-sm font-semibold text-slate-700">
                        บันทึกส่วนตัวแพทย์ (Doctor Note)
                    </Label>
                    <textarea
                        id="soap_p"
                        value={values.soap_p}
                        onChange={(e) => handleChange("soap_p", e.target.value)}
                        rows={5}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-sm"
                        placeholder="บันทึกเพิ่มเติมสำหรับแพทย์, แผนการรักษา, หรือข้อสังเกตอื่นๆ..."
                    />
                </div>

                {visitType === "aesthetic" && (
                    <div className="mt-6 pt-5 border-t">
                        <h3 className="text-sm font-semibold text-primary mb-4">✨ บันทึกหัตถการเสริมความงาม</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="procedure_name">ชื่อหัตถการ / โปรแกรม</Label>
                                <input id="procedure_name" value={aestheticValues.procedure_name}
                                    onChange={(e) => handleAestheticChange("procedure_name", e.target.value)}
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="เช่น Botox, Filler, เลเซอร์หน้าใส" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="treated_area">บริเวณที่ทำ (Treated Area)</Label>
                                <input id="treated_area" value={aestheticValues.treated_area}
                                    onChange={(e) => handleAestheticChange("treated_area", e.target.value)}
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="เช่น หน้าผาก, หางตา, กราม" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="lot_number">Lot No. / Serial Number ยาที่ใช้</Label>
                                <input id="lot_number" value={aestheticValues.lot_number}
                                    onChange={(e) => handleAestheticChange("lot_number", e.target.value)}
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="ระบุ Lot ยาเพื่อตรวจสอบย้อนหลัง" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="aesthetic_note">Note เพิ่มเติม (เทคนิค, จำนวน U)</Label>
                                <textarea id="aesthetic_note" value={aestheticValues.aesthetic_note}
                                    onChange={(e) => handleAestheticChange("aesthetic_note", e.target.value)}
                                    rows={3}
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="เช่น ใช้โบท็อกซ์ 50U เทคนิค Micro-droplet" />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
