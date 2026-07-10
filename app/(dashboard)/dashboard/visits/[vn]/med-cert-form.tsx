"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, CheckCircle, Save, Printer, ShieldCheck, Lock, Undo2, Upload, Trash2 } from "lucide-react";
import { saveMedCert, approveMedCert, reopenMedCert, getMySignature, setMySignature, type MedCertInput } from "@/lib/actions/med-cert";
import { MED_CERT_TYPES } from "@/lib/med-cert-types";

interface MedCertInitial {
    cert_type?: string;
    doctor_opinion?: string | null;
    rest_days?: number | null;
    rest_from?: string | null;
    rest_to?: string | null;
    status?: string | null;
    sign_mode?: string | null;
}

interface MedCertFormProps {
    vn: string;
    hn: string;
    initial?: MedCertInitial | null;
}

const medCertTypes = [
    { value: "none", label: "-- ไม่ออกใบรับรอง --" },
    ...MED_CERT_TYPES.map((t) => ({ value: t.value as string, label: t.label as string })),
];

export default function MedCertForm({ vn, hn, initial }: MedCertFormProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const [certType, setCertType] = useState(initial?.cert_type || "none");
    const [doctorOpinion, setDoctorOpinion] = useState(initial?.doctor_opinion || "");
    const [restDays, setRestDays] = useState(initial?.rest_days != null ? String(initial.rest_days) : "");
    const [restFrom, setRestFrom] = useState(initial?.rest_from || "");
    const [restTo, setRestTo] = useState(initial?.rest_to || "");
    const [signMode, setSignMode] = useState(initial?.sign_mode || "manual");
    const [status, setStatus] = useState(initial?.status || (initial?.cert_type ? "draft" : "none"));
    const [error, setError] = useState("");
    const [dirty, setDirty] = useState(false);

    // ลายเซ็นของแพทย์ที่ล็อกอิน (data URL)
    const [mySig, setMySig] = useState<string | null>(null);
    const [sigBusy, setSigBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    useEffect(() => { getMySignature().then(setMySig); }, []);

    function onPickSignature(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 400_000) { setError("รูปใหญ่เกิน ~350KB — ครอปให้เล็กลง"); return; }
        setSigBusy(true); setError("");
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = String(reader.result || "");
            const r = await setMySignature(dataUrl);
            setSigBusy(false);
            if (!r.success) { setError(r.error || "อัปโหลดไม่สำเร็จ"); return; }
            setMySig(dataUrl);
        };
        reader.onerror = () => { setSigBusy(false); setError("อ่านไฟล์ไม่สำเร็จ"); };
        reader.readAsDataURL(file);
    }
    async function removeSignature() {
        setSigBusy(true);
        const r = await setMySignature(null);
        setSigBusy(false);
        if (r.success) setMySig(null);
    }

    const needsCert = certType !== "none";
    const isApproved = status === "approved";
    const mark = () => { setDirty(true); if (status === "none") setStatus("draft"); };

    function doSave(then?: () => void) {
        setError("");
        const input: MedCertInput = {
            cert_type: certType, doctor_opinion: doctorOpinion, sign_mode: signMode,
            rest_days: restDays ? parseInt(restDays) : null,
            rest_from: restFrom || null, rest_to: restTo || null,
        };
        startTransition(async () => {
            const r = await saveMedCert(vn, hn, input);
            if (!r.success) { setError(r.error || "บันทึกไม่สำเร็จ"); return; }
            setDirty(false); if (status === "none") setStatus("draft");
            router.refresh();
            then?.();
        });
    }
    function doApprove() {
        setError("");
        startTransition(async () => {
            const s = await saveMedCert(vn, hn, { cert_type: certType, doctor_opinion: doctorOpinion, sign_mode: signMode, rest_days: restDays ? parseInt(restDays) : null, rest_from: restFrom || null, rest_to: restTo || null });
            if (!s.success) { setError(s.error || "บันทึกไม่สำเร็จ"); return; }
            const r = await approveMedCert(vn);
            if (!r.success) { setError(r.error || "อนุมัติไม่สำเร็จ"); return; }
            setStatus("approved"); setDirty(false); router.refresh();
        });
    }
    function doReopen() {
        startTransition(async () => {
            const r = await reopenMedCert(vn);
            if (r.success) { setStatus("draft"); router.refresh(); }
        });
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-600" /> ใบรับรองแพทย์
                    {isApproved && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle className="h-3 w-3" /> อนุมัติแล้ว</span>}
                    {status === "draft" && needsCert && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">ฉบับร่าง</span>}
                </h2>
                {needsCert && (
                    <div className="flex items-center gap-1.5">
                        {isApproved ? (
                            <>
                                <div className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-1.5 py-1">
                                    <Printer className="h-4 w-4 text-blue-600" />
                                    <span className="text-[11px] font-bold text-blue-700">พิมพ์:</span>
                                    <Link href={`/print/med-cert/${vn}?lang=th`} target="_blank" className="text-xs font-bold px-2 py-0.5 rounded-lg bg-white border border-blue-200 hover:bg-blue-100 text-blue-700">ไทย</Link>
                                    <Link href={`/print/med-cert/${vn}?lang=en`} target="_blank" className="text-xs font-bold px-2 py-0.5 rounded-lg bg-white border border-blue-200 hover:bg-blue-100 text-blue-700">EN</Link>
                                    <Link href={`/print/med-cert/${vn}?lang=both`} target="_blank" className="text-xs font-bold px-2 py-0.5 rounded-lg bg-white border border-blue-200 hover:bg-blue-100 text-blue-700">2 ภาษา</Link>
                                </div>
                                <Button size="sm" variant="outline" onClick={doReopen} disabled={pending} className="rounded-xl gap-1.5"><Undo2 className="h-4 w-4" /> เปิดแก้</Button>
                            </>
                        ) : (
                            <>
                                <Button size="sm" variant="outline" onClick={() => doSave()} disabled={pending || !dirty} className="rounded-xl gap-1.5">
                                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึก
                                </Button>
                                <Button size="sm" onClick={doApprove} disabled={pending} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                                    <ShieldCheck className="h-4 w-4" /> Approve
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

            {isApproved && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                    <Lock className="h-4 w-4 shrink-0" /> อนุมัติแล้ว — เคาน์เตอร์พิมพ์ได้จากหน้าจ่ายเงิน · กด “เปิดแก้” เพื่อแก้ไข
                </div>
            )}

            {/* Type selector */}
            <div className="space-y-1.5">
                <Label htmlFor="cert_type">ประเภทใบรับรองแพทย์</Label>
                <select id="cert_type" value={certType} disabled={isApproved}
                    onChange={e => { setCertType(e.target.value); mark(); }}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-slate-50">
                    {medCertTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p className="text-[11px] text-slate-400">ข้อมูล ชื่อ/อายุ/วันที่/ICD-10/คลินิก/แพทย์ ดึงจาก Visit อัตโนมัติตอนพิมพ์</p>
            </div>

            {needsCert && (
                <div className="space-y-4">
                    {certType === "sick_leave" && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label>หยุดพักตั้งแต่</Label>
                                <input type="date" value={restFrom} disabled={isApproved}
                                    onChange={e => { setRestFrom(e.target.value); mark(); }}
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm disabled:bg-slate-50" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>ถึงวันที่</Label>
                                <input type="date" value={restTo} disabled={isApproved}
                                    onChange={e => {
                                        setRestTo(e.target.value); mark();
                                        if (restFrom && e.target.value) {
                                            const d = Math.round((new Date(e.target.value).getTime() - new Date(restFrom).getTime()) / 86400000) + 1;
                                            if (d > 0) setRestDays(String(d));
                                        }
                                    }}
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm disabled:bg-slate-50" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>รวม (วัน)</Label>
                                <input type="number" min={1} value={restDays} disabled={isApproved}
                                    onChange={e => { setRestDays(e.target.value); mark(); }}
                                    placeholder="เช่น 3"
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm tabular-nums disabled:bg-slate-50" />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="doctor_opinion">ความเห็นของแพทย์</Label>
                        <textarea id="doctor_opinion" value={doctorOpinion} disabled={isApproved}
                            onChange={e => { setDoctorOpinion(e.target.value); mark(); }} rows={4}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-slate-50"
                            placeholder="ความเห็นแพทย์ / คำวินิจฉัยเพิ่มเติม" />
                    </div>

                    {/* Signature mode */}
                    <div className="space-y-1.5">
                        <Label>รูปแบบลายเซ็นตอนพิมพ์</Label>
                        <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 gap-0.5">
                            <button type="button" disabled={isApproved} onClick={() => { setSignMode("manual"); mark(); }}
                                className={`h-9 px-3 rounded-lg text-xs font-bold ${signMode === "manual" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600"}`}>เว้นที่เซ็นมือ</button>
                            <button type="button" disabled={isApproved} onClick={() => { setSignMode("digital"); mark(); }}
                                className={`h-9 px-3 rounded-lg text-xs font-bold ${signMode === "digital" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600"}`}>ลายเซ็นดิจิทัล</button>
                        </div>
                        <p className="text-[11px] text-slate-400">ดิจิทัล = ใส่รูปลายเซ็นหมอลง PDF · เว้นที่ = พิมพ์เปล่าให้เซ็นมือ</p>

                        {signMode === "digital" && (
                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-slate-600">ลายเซ็นของฉัน (ใช้กับใบรับรองทุกใบ)</span>
                                    <div className="flex items-center gap-1.5">
                                        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickSignature} />
                                        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={sigBusy} className="rounded-lg gap-1.5 h-8">
                                            {sigBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {mySig ? "เปลี่ยนรูป" : "อัปโหลดลายเซ็น"}
                                        </Button>
                                        {mySig && <button type="button" onClick={removeSignature} disabled={sigBusy} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                                    </div>
                                </div>
                                {mySig ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={mySig} alt="signature" className="h-14 object-contain mt-2 bg-white border border-slate-200 rounded-lg px-2" />
                                ) : (
                                    <p className="text-[11px] text-amber-600 mt-1.5">⚠ ยังไม่มีลายเซ็น — อัปโหลดรูป PNG พื้นหลังโปร่ง (ครอปเฉพาะลายเซ็น &lt; 350KB) แล้วจะ render ลง PDF อัตโนมัติ</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
            <span className="hidden">{hn}</span>
        </div>
    );
}
