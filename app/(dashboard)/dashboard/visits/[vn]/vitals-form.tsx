"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Save, Loader2, CheckCircle, Activity, Heart, Scale } from "lucide-react";
import { HorizontalForm, Section, FieldRow, FORM_INPUT_CLS } from "@/components/ui/horizontal-form";

interface VitalsFormProps {
    vn: string;
    hn: string;
    existing?: {
        bp_systolic?: number | null;
        bp_diastolic?: number | null;
        pulse_rate?: number | null;
        temperature?: number | null;
        weight_kg?: number | null;
        height_cm?: number | null;
        respiratory_rate?: number | null;
        o2_saturation?: number | null;
    } | null;
}

/** Input with unit suffix — used inside FieldRow */
function VitalNumberInput({
    value, onChange, placeholder, unit, className,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    unit: string;
    className?: string;
}) {
    return (
        <div className="flex items-center gap-2 max-w-[220px]">
            <Input
                type="number"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                step="0.1"
                className={`${FORM_INPUT_CLS} text-center font-semibold tabular-nums ${className || ""}`}
            />
            <span className="text-[14px] text-slate-500 font-medium shrink-0 w-12">{unit}</span>
        </div>
    );
}

export default function VitalsForm({ vn, hn, existing }: VitalsFormProps) {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    const [vals, setVals] = useState({
        bp_systolic: existing?.bp_systolic?.toString() || "",
        bp_diastolic: existing?.bp_diastolic?.toString() || "",
        pulse_rate: existing?.pulse_rate?.toString() || "",
        temperature: existing?.temperature?.toString() || "",
        weight_kg: existing?.weight_kg?.toString() || "",
        height_cm: existing?.height_cm?.toString() || "",
        respiratory_rate: existing?.respiratory_rate?.toString() || "",
        o2_saturation: existing?.o2_saturation?.toString() || "",
    });

    function set(key: string) {
        return (v: string) => { setVals(p => ({ ...p, [key]: v })); setSaved(false); };
    }

    const n = (v: string) => v ? parseFloat(v) : null;

    // Compute BMI preview
    const bmi = vals.weight_kg && vals.height_cm
        ? (parseFloat(vals.weight_kg) / Math.pow(parseFloat(vals.height_cm) / 100, 2)).toFixed(1)
        : null;

    const bmiClass = bmi
        ? parseFloat(bmi) < 18.5 ? "bg-blue-100 border-blue-200 text-blue-700"
            : parseFloat(bmi) < 25 ? "bg-emerald-100 border-emerald-200 text-emerald-700"
                : parseFloat(bmi) < 30 ? "bg-amber-100 border-amber-200 text-amber-700"
                    : "bg-red-100 border-red-200 text-red-700"
        : "bg-slate-100 border-slate-200 text-slate-400";

    const bmiLabel = bmi
        ? parseFloat(bmi) < 18.5 ? "ต่ำกว่าเกณฑ์"
            : parseFloat(bmi) < 25 ? "ปกติ"
                : parseFloat(bmi) < 30 ? "เกินมาตรฐาน"
                    : "อ้วน"
        : null;

    async function handleSave() {
        setLoading(true);
        setError("");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            const { error: insertErr } = await supabase.from("vital_signs").insert({
                vn, hn,
                bp_systolic: n(vals.bp_systolic),
                bp_diastolic: n(vals.bp_diastolic),
                pulse_rate: n(vals.pulse_rate),
                temperature: n(vals.temperature),
                weight_kg: n(vals.weight_kg),
                height_cm: n(vals.height_cm),
                respiratory_rate: n(vals.respiratory_rate),
                o2_saturation: n(vals.o2_saturation),
            });

            if (insertErr) throw insertErr;

            await supabase.from("visits").update({
                weight_kg: n(vals.weight_kg),
                height_cm: n(vals.height_cm),
                bp_systolic: n(vals.bp_systolic),
                bp_diastolic: n(vals.bp_diastolic),
                pulse_rate: n(vals.pulse_rate),
                temperature: n(vals.temperature),
            }).eq("vn", vn);

            setSaved(true);
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-emerald-600" />
                    บันทึก Vital Signs
                </h2>
                <Button
                    onClick={handleSave}
                    disabled={loading}
                    className={`rounded-xl h-11 px-6 text-[15px] font-bold ${
                        saved
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : "bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                    } text-white shadow-md shadow-blue-500/25`}
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> :
                        saved ? <CheckCircle className="h-4 w-4 mr-1.5" /> :
                            <Save className="h-4 w-4 mr-1.5" />}
                    {saved ? "บันทึกแล้ว" : "บันทึก"}
                </Button>
            </div>

            {error && (
                <p className="text-[15px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
            )}

            <HorizontalForm>
                {/* ── ความดันโลหิต ── */}
                <Section title="ความดันโลหิต (Blood Pressure)" icon={Heart} color="rose">
                    <FieldRow label="Systolic">
                        <VitalNumberInput value={vals.bp_systolic} onChange={set("bp_systolic")} placeholder="120" unit="mmHg" />
                    </FieldRow>
                    <FieldRow label="Diastolic">
                        <VitalNumberInput value={vals.bp_diastolic} onChange={set("bp_diastolic")} placeholder="80" unit="mmHg" />
                    </FieldRow>
                </Section>

                {/* ── สัญญาณชีพ ── */}
                <Section title="สัญญาณชีพ" icon={Activity} color="sky">
                    <FieldRow label="ชีพจร (Pulse)">
                        <VitalNumberInput value={vals.pulse_rate} onChange={set("pulse_rate")} placeholder="72" unit="bpm" />
                    </FieldRow>
                    <FieldRow label="อุณหภูมิ">
                        <VitalNumberInput value={vals.temperature} onChange={set("temperature")} placeholder="37.0" unit="°C" />
                    </FieldRow>

                    <FieldRow label="อัตราหายใจ (RR)">
                        <VitalNumberInput value={vals.respiratory_rate} onChange={set("respiratory_rate")} placeholder="16" unit="/min" />
                    </FieldRow>
                    <FieldRow label="O₂ Saturation">
                        <VitalNumberInput value={vals.o2_saturation} onChange={set("o2_saturation")} placeholder="99" unit="%" />
                    </FieldRow>
                </Section>

                {/* ── น้ำหนัก / ส่วนสูง / BMI ── */}
                <Section title="น้ำหนัก / ส่วนสูง / BMI" icon={Scale} color="teal">
                    <FieldRow label="น้ำหนัก">
                        <VitalNumberInput value={vals.weight_kg} onChange={set("weight_kg")} placeholder="60" unit="kg" />
                    </FieldRow>
                    <FieldRow label="ส่วนสูง">
                        <VitalNumberInput value={vals.height_cm} onChange={set("height_cm")} placeholder="165" unit="cm" />
                    </FieldRow>

                    <FieldRow label="BMI" colSpan={2}>
                        <div className="flex items-center gap-3">
                            <div className={`h-11 px-5 rounded-lg border-2 flex items-center justify-center font-bold text-xl tabular-nums min-w-[100px] ${bmiClass}`}>
                                {bmi || "—"}
                            </div>
                            {bmiLabel && (
                                <span className={`text-[14px] font-bold px-3 py-1 rounded-lg ${bmiClass}`}>
                                    {bmiLabel}
                                </span>
                            )}
                            {!bmi && (
                                <span className="text-[13px] text-slate-500">กรอกน้ำหนัก + ส่วนสูง เพื่อคำนวณ BMI</span>
                            )}
                        </div>
                    </FieldRow>
                </Section>
            </HorizontalForm>
        </div>
    );
}
