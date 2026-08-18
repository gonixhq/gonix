"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
    ShieldCheck, UserPlus, Search, Loader2, TestTube, AlertTriangle,
    Clock, Wallet, X, Plus, FlaskConical, CheckCircle2, QrCode, Globe, Download, Copy, FileText,
    KeyRound, ArrowRight, Package, Pencil, Trash2, Layers, Save, CalendarClock,
} from "lucide-react";
import { createAnonCase, openCaseByCode, createAnonPanel, updateAnonPanel, deleteAnonPanel, type AnonCaseRow, type AnonStats, type LabService, type AnonPanel } from "@/lib/actions/anonymous";

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

const STATUS: Record<string, { label: string; cls: string }> = {
    registered: { label: "ลงทะเบียน", cls: "bg-blue-100 text-blue-700" },
    opened: { label: "เปิดเคสแล้ว", cls: "bg-blue-100 text-blue-700" },
    collected: { label: "เก็บตัวอย่าง", cls: "bg-indigo-100 text-indigo-700" },
    resulted: { label: "มีผลแล้ว", cls: "bg-emerald-100 text-emerald-700" },
    closed: { label: "ปิดเคส", cls: "bg-slate-200 text-slate-600" },
    cancelled: { label: "ยกเลิก", cls: "bg-slate-200 text-slate-500" },
};
const SEX_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง", other: "อื่นๆ" };
const ITEM_TYPE_LABEL: Record<string, string> = {
    lab_external: "แล็บภายนอก", lab: "แล็บ", procedure: "หัตถการ", service: "บริการ",
    doctor_fee: "ค่าตรวจ", supply: "เวชภัณฑ์", other: "อื่นๆ",
};

export default function AnonymousClient({
    cases, stats, services, panels, clinicId,
}: {
    cases: AnonCaseRow[];
    stats: AnonStats;
    services: LabService[];
    panels: AnonPanel[];
    clinicId: string;
}) {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [showReg, setShowReg] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [showPanels, setShowPanels] = useState(false);
    const [openCode, setOpenCode] = useState("");
    const [openErr, setOpenErr] = useState("");
    const [opening, startOpen] = useTransition();

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return cases;
        return cases.filter((c) => c.code.toLowerCase().includes(q));
    }, [cases, search]);

    function handleOpenByCode() {
        setOpenErr("");
        const code = openCode.trim();
        if (!code) { setOpenErr("กรุณากรอกรหัส"); return; }
        startOpen(async () => {
            const res = await openCaseByCode(code);
            if (res.ok) router.push(`/dashboard/anonymous/${res.id}`);
            else setOpenErr(res.error);
        });
    }

    const statCards = [
        { label: "รอเปิดเคส (ออนไลน์)", value: stats.pendingOnline, icon: Globe, tile: "bg-cyan-100", color: "text-cyan-600" },
        { label: "กำลังให้บริการ", value: stats.awaitingResult, icon: Clock, tile: "bg-amber-100", color: "text-amber-600" },
        { label: "ผลบวก (ยังไม่ปิด)", value: stats.positiveOpen, icon: AlertTriangle, tile: "bg-rose-100", color: "text-rose-600" },
        { label: "ค้างชำระ", value: stats.unpaid, icon: Wallet, tile: "bg-[#0EA5A0]/10", color: "text-[#0EA5A0]" },
    ];

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-12">
            {/* Header */}
            <div className="gonix-card-premium p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl flex items-center justify-center bg-[#2B54F0]/10 shrink-0">
                        <ShieldCheck className="h-5 w-5 text-[#2B54F0]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight leading-tight">คลินิกนิรนาม</h1>
                        <p className="text-xs text-slate-500 mt-0.5">ตรวจเลือดแบบไม่ระบุตัวตน — ใช้รหัสเคสแทนชื่อ</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowQR(true)}
                        className="h-10 px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold text-[#2B54F0] border border-[#2B54F0]/30 hover:bg-[#2B54F0]/5">
                        <QrCode className="h-4 w-4" /> QR ลงทะเบียน
                    </button>
                    <button onClick={() => setShowPanels(true)}
                        className="h-10 px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">
                        <Package className="h-4 w-4" /> จัดการแพ็กเกจ
                    </button>
                    <button onClick={() => setShowReg(true)}
                        className="h-10 px-4 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white shadow-sm"
                        style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                        <UserPlus className="h-4 w-4" /> ลงทะเบียนเคสใหม่
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {statCards.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className="gonix-card-premium p-4">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-2.5 ${s.tile}`}>
                                <Icon className={`h-5 w-5 ${s.color}`} />
                            </div>
                            <div className="text-2xl font-extrabold text-slate-800 tabular-nums">{s.value}</div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mt-0.5">{s.label}</div>
                        </div>
                    );
                })}
            </div>

            {/* แจ้งเตือน: มีผู้รับบริการขอนัดหมาย */}
            {stats.followupPending > 0 && (
                <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                        <CalendarClock className="h-5 w-5 text-rose-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-rose-700">มี {stats.followupPending} เคสขอนัดหมายพบแพทย์</p>
                        <p className="text-xs text-rose-600/80">ผู้รับบริการกดขอนัดผ่านหน้าเช็คผลออนไลน์ — เปิดเคสที่มีป้าย “ขอนัด” ด้านล่างเพื่อติดต่อกลับ</p>
                    </div>
                </div>
            )}

            {/* เปิดเคสด้วยรหัสยืนยัน */}
            <div className="gonix-card-premium p-4">
                <div className="flex items-center gap-2 mb-1">
                    <div className="h-8 w-8 rounded-lg bg-[#2B54F0]/10 flex items-center justify-center">
                        <KeyRound className="h-4 w-4 text-[#2B54F0]" />
                    </div>
                    <h2 className="text-sm font-bold text-slate-800">เปิดเคสด้วยรหัสยืนยัน</h2>
                </div>
                <p className="text-xs text-slate-500 mb-3 ml-10">
                    ให้ผู้รับบริการแจ้ง <b>รหัส 6 หลัก</b> แล้วป้อนเพื่อเปิดเคส — เคสที่ลงทะเบียนออนไลน์จะถูกซ่อนจนกว่าจะเปิดด้วยรหัส
                </p>
                <div className="flex gap-2 ml-10">
                    <input
                        value={openCode}
                        onChange={(e) => setOpenCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === "Enter") handleOpenByCode(); }}
                        maxLength={6} placeholder="เช่น 3A8RVS"
                        className="w-44 h-11 rounded-xl border-2 border-slate-200 px-3 text-lg font-mono font-bold tracking-[0.2em] uppercase text-[#2B54F0] focus:border-[#2B54F0] focus:outline-none"
                    />
                    <button onClick={handleOpenByCode} disabled={opening}
                        className="h-11 px-5 rounded-xl text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                        style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                        {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} เปิดเคส
                    </button>
                </div>
                {openErr && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 mt-2 ml-10 inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" /> {openErr}</p>}
            </div>

            {/* Active cases (เปิดแล้ว) + search */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นเคสที่เปิดแล้วด้วยรหัส"
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                    <span className="text-xs text-slate-400">{filtered.length} เคสที่เปิด</span>
                </div>

                {filtered.length === 0 ? (
                    <div className="text-center py-14 text-slate-400">
                        <FlaskConical className="h-10 w-10 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">{search ? "ไม่พบรหัสนี้ในเคสที่เปิด" : "ยังไม่มีเคสที่เปิด — ป้อนรหัสยืนยันด้านบนเพื่อเปิดเคส"}</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50/60">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="text-left px-4 py-2.5">รหัสเคส</th>
                                <th className="text-left px-4 py-2.5">วันที่</th>
                                <th className="text-left px-4 py-2.5">เพศ/อายุ</th>
                                <th className="text-center px-4 py-2.5">รายการตรวจ</th>
                                <th className="text-center px-4 py-2.5">สถานะ</th>
                                <th className="text-right px-4 py-2.5">ยอด</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((c) => {
                                const st = STATUS[c.status] || STATUS.registered;
                                return (
                                    <tr key={c.id} className={`border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer ${c.cancelled_at ? "opacity-60" : ""}`}
                                        onClick={() => router.push(`/dashboard/anonymous/${c.id}`)}>
                                        <td className="px-4 py-3">
                                            <span className="font-mono font-bold text-[#2B54F0]">{c.code}</span>
                                            {c.reg_channel === "online" && (
                                                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 inline-flex items-center gap-0.5"><Globe className="h-2.5 w-2.5" /> ออนไลน์</span>
                                            )}
                                            {c.positive_count > 0 && (
                                                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">ผลบวก</span>
                                            )}
                                            {c.followup_requested && (
                                                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 inline-flex items-center gap-0.5"><CalendarClock className="h-2.5 w-2.5" /> ขอนัด</span>
                                            )}
                                            {c.cancelled_at && (
                                                <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                                                    ยกเลิก {new Date(c.cancelled_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}{c.cancelled_by_name ? ` · โดย ${c.cancelled_by_name}` : ""}{c.cancel_reason ? ` · ${c.cancel_reason}` : ""}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{formatDateThai(c.case_date)}</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {c.sex ? SEX_LABEL[c.sex] || c.sex : "—"}{c.age != null ? ` · ${c.age} ปี` : ""}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="inline-flex items-center gap-1 text-slate-600">
                                                <TestTube className="h-3.5 w-3.5 text-slate-400" /> {c.test_count}
                                            </span>
                                            {c.pending_count > 0 && <span className="ml-1.5 text-[10px] text-amber-600">(รอผล {c.pending_count})</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="font-bold text-slate-800 tabular-nums">{baht(c.total_amount)}</div>
                                            <div className={`text-[10px] font-semibold ${c.paid ? "text-emerald-600" : "text-amber-600"}`}>
                                                {c.paid ? "ชำระแล้ว" : "ค้างชำระ"}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {showReg && (
                <RegisterModal services={services} panels={panels} onClose={() => setShowReg(false)}
                    onCreated={(id) => { setShowReg(false); router.push(`/dashboard/anonymous/${id}`); }} />
            )}
            {showQR && <QRRegisterModal clinicId={clinicId} onClose={() => setShowQR(false)} />}
            {showPanels && <PanelManagerModal panels={panels} services={services} onClose={() => setShowPanels(false)} onChanged={() => router.refresh()} />}
        </div>
    );
}

// ── QR ลงทะเบียนออนไลน์ (ให้คนไข้สแกน) ───────────────
function QRRegisterModal({ clinicId, onClose }: { clinicId: string; onClose: () => void }) {
    const [qr, setQr] = useState("");
    const [copied, setCopied] = useState(false);
    const [resultCopied, setResultCopied] = useState(false);
    const url = typeof window !== "undefined" ? `${window.location.origin}/checkin/${clinicId}` : "";
    const resultUrl = typeof window !== "undefined" ? `${window.location.origin}/result` : "";

    useEffect(() => {
        if (url) QRCode.toDataURL(url, { width: 360, margin: 1 }).then(setQr).catch(() => setQr(""));
    }, [url]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <h2 className="font-bold text-slate-800 inline-flex items-center gap-2"><QrCode className="h-4 w-4 text-[#2B54F0]" /> QR ลงทะเบียนออนไลน์</h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="h-4 w-4 text-slate-500" /></button>
                </div>
                <div className="p-5 text-center space-y-3">
                    <p className="text-xs text-slate-500">ให้ผู้รับบริการสแกนเพื่อลงทะเบียน + ทำแบบประเมินเองก่อนมาคลินิก</p>
                    {qr
                        ? <img src={qr} alt="QR" className="w-56 h-56 mx-auto rounded-xl border border-slate-200" />
                        : <div className="w-56 h-56 mx-auto rounded-xl bg-slate-100 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] font-mono text-slate-600 break-all">{url}</div>
                    <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                            className="flex-1 h-9 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 inline-flex items-center justify-center gap-1.5 hover:bg-slate-50">
                            <Copy className="h-4 w-4" /> {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                        </button>
                        {qr && (
                            <a href={qr} download={`checkin-qr.png`}
                                className="flex-1 h-9 rounded-lg bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5">
                                <Download className="h-4 w-4" /> ดาวน์โหลด
                            </a>
                        )}
                    </div>
                    <div className="pt-3 mt-1 border-t border-slate-100 text-left">
                        <p className="text-xs font-bold text-slate-700 mb-1.5 inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-[#2B54F0]" /> ลิงก์ดูผลตรวจ (ให้คนไข้)</p>
                        <div className="flex gap-2">
                            <div className="flex-1 min-w-0 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] font-mono text-slate-600 truncate">{resultUrl.replace(/^https?:\/\//, "")}</div>
                            <button onClick={() => { navigator.clipboard?.writeText(resultUrl); setResultCopied(true); setTimeout(() => setResultCopied(false), 1500); }} className="shrink-0 h-9 w-10 rounded-lg border border-slate-200 inline-flex items-center justify-center hover:bg-slate-50" title="คัดลอกลิงก์ดูผล">{resultCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-500" />}</button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">คนไข้เข้าลิงก์นี้ → กรอกรหัส 6 หลัก + เบอร์ 4 ตัวท้าย เพื่อดูผลตรวจเอง</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatDateThai(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

// ── Register modal ──────────────────────────────────
function RegisterModal({
    services, panels, onClose, onCreated,
}: {
    services: LabService[];
    panels: AnonPanel[];
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [sex, setSex] = useState("");
    const [age, setAge] = useState("");
    const [risk, setRisk] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [selPanels, setSelPanels] = useState<Set<string>>(new Set());
    const activePanels = panels.filter((p) => p.is_active);
    const [preDone, setPreDone] = useState(false);
    const [preNote, setPreNote] = useState("");
    const [err, setErr] = useState("");
    const [saving, startSave] = useTransition();

    const grouped = useMemo(() => {
        const m = new Map<string, LabService[]>();
        services.forEach((s) => {
            const arr = m.get(s.item_type) || [];
            arr.push(s); m.set(s.item_type, arr);
        });
        return [...m.entries()];
    }, [services]);

    const total = useMemo(
        () => services.filter((s) => selected.has(s.id)).reduce((sum, s) => sum + s.price, 0)
            + panels.filter((p) => selPanels.has(p.id)).reduce((sum, p) => sum + p.price, 0),
        [services, selected, panels, selPanels]
    );

    function togglePanel(id: string) {
        setSelPanels((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    }

    function toggle(id: string) {
        setSelected((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    }

    function submit() {
        setErr("");
        if (selected.size === 0 && selPanels.size === 0) { setErr("กรุณาเลือกแพ็กเกจหรือรายการตรวจอย่างน้อย 1 รายการ"); return; }
        startSave(async () => {
            const res = await createAnonCase({
                sex: sex || undefined,
                age: age ? Number(age) : null,
                risk_note: risk || undefined,
                serviceIds: [...selected],
                panelIds: [...selPanels],
                pre_counsel_done: preDone,
                pre_counsel_note: preNote || undefined,
            });
            if (res.ok) onCreated(res.id);
            else setErr(res.error);
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-[#2B54F0]/10 flex items-center justify-center">
                            <UserPlus className="h-4 w-4 text-[#2B54F0]" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-800">ลงทะเบียนเคสนิรนาม</h2>
                            <p className="text-[11px] text-slate-500">ระบบจะออกรหัสเคสให้อัตโนมัติ — ไม่บันทึกชื่อ</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Demographics */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block">เพศ</label>
                            <select value={sex} onChange={(e) => setSex(e.target.value)}
                                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#2B54F0] focus:outline-none">
                                <option value="">— ไม่ระบุ —</option>
                                <option value="male">ชาย</option>
                                <option value="female">หญิง</option>
                                <option value="other">อื่นๆ</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block">อายุ (ปี)</label>
                            <input type="number" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)}
                                placeholder="เช่น 28"
                                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#2B54F0] focus:outline-none" />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">ความเสี่ยง / บันทึกก่อนตรวจ</label>
                        <textarea value={risk} onChange={(e) => setRisk(e.target.value)} rows={2}
                            placeholder="เช่น มีพฤติกรรมเสี่ยง, ต้องการตรวจคัดกรอง ฯลฯ"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#2B54F0] focus:outline-none resize-none" />
                    </div>

                    {/* Panel selection */}
                    {activePanels.length > 0 && (
                        <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1.5 block inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-[#2B54F0]" /> แพ็กเกจ (ตรวจเป็นชุด)</label>
                            <div className="grid sm:grid-cols-2 gap-2">
                                {activePanels.map((p) => {
                                    const on = selPanels.has(p.id);
                                    return (
                                        <button key={p.id} type="button" onClick={() => togglePanel(p.id)}
                                            className={`text-left rounded-xl border p-2.5 transition ${on ? "border-[#2B54F0] bg-[#2B54F0]/5 ring-1 ring-[#2B54F0]/30" : "border-slate-200 hover:border-slate-300"}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-bold text-slate-800">{p.name}</span>
                                                <span className="text-sm font-black text-[#2B54F0] tabular-nums shrink-0">{baht(p.price)}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{p.items.map((i) => i.name).join(" · ") || "—"}</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">{p.items.length} รายการ · รอผล {p.result_days} วัน</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Test selection */}
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1.5 block">เลือกรายการตรวจ *</label>
                        {services.length === 0 ? (
                            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                                ยังไม่มีรายการบริการในระบบ — เพิ่มได้ที่ ตั้งค่า → รายการบริการ & ราคา
                            </p>
                        ) : (
                            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                                {grouped.map(([type, list]) => (
                                    <div key={type}>
                                        <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            {ITEM_TYPE_LABEL[type] || type}
                                        </div>
                                        {list.map((s) => {
                                            const on = selected.has(s.id);
                                            return (
                                                <button key={s.id} type="button" onClick={() => toggle(s.id)}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 ${on ? "bg-[#2B54F0]/5" : ""}`}>
                                                    <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-[#2B54F0] border-[#2B54F0]" : "border-slate-300"}`}>
                                                        {on && <CheckCircle2 className="h-3 w-3 text-white" />}
                                                    </span>
                                                    <span className="flex-1 text-sm text-slate-700">{s.name}</span>
                                                    <span className="text-xs font-semibold text-slate-500 tabular-nums">{baht(s.price)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pre-counsel */}
                    <div className="rounded-xl border border-slate-200 p-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={preDone} onChange={(e) => setPreDone(e.target.checked)} className="h-4 w-4 accent-[#2B54F0]" />
                            <span className="text-sm font-semibold text-slate-700">ให้คำปรึกษาก่อนตรวจแล้ว (pre-test counseling)</span>
                        </label>
                        {preDone && (
                            <textarea value={preNote} onChange={(e) => setPreNote(e.target.value)} rows={2}
                                placeholder="บันทึกการให้คำปรึกษา (ไม่บังคับ)"
                                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#2B54F0] focus:outline-none resize-none" />
                        )}
                    </div>

                    {err && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{err}</p>}
                </div>

                <div className="border-t border-slate-100 p-4 flex items-center justify-between gap-3">
                    <div className="text-sm">
                        <span className="text-slate-500">รวม </span>
                        <span className="font-black text-slate-800 tabular-nums text-lg">{baht(total)}</span>
                        <span className="text-slate-400 text-xs ml-1">({selected.size} รายการ)</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="h-10 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
                        <button onClick={submit} disabled={saving}
                            className="h-10 px-5 rounded-xl text-sm font-bold text-white shadow-sm inline-flex items-center gap-1.5 disabled:opacity-60"
                            style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            ลงทะเบียน + ออกรหัส
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ── จัดการแพ็กเกจตรวจ (Lab Panels) ───────────────────
function PanelManagerModal({
    panels, services, onClose, onChanged,
}: {
    panels: AnonPanel[];
    services: LabService[];
    onClose: () => void;
    onChanged: () => void;
}) {
    const [editing, setEditing] = useState<AnonPanel | "new" | null>(null);
    const [busy, startBusy] = useTransition();

    function del(p: AnonPanel) {
        if (!confirm(`ลบแพ็กเกจ "${p.name}" ?`)) return;
        startBusy(async () => { await deleteAnonPanel(p.id); onChanged(); });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-[#2B54F0]/10 flex items-center justify-center"><Package className="h-4 w-4 text-[#2B54F0]" /></div>
                        <div>
                            <h2 className="font-bold text-slate-800">แพ็กเกจตรวจ (Lab Panels)</h2>
                            <p className="text-[11px] text-slate-500">ตั้งชุดตรวจ — เพิ่มเข้าเคสครั้งเดียว คิดราคาแพ็กเดียว แตกผลแยกรายการ</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="h-4 w-4 text-slate-500" /></button>
                </div>

                {editing ? (
                    <PanelForm
                        panel={editing === "new" ? null : editing}
                        services={services}
                        onCancel={() => setEditing(null)}
                        onSaved={() => { setEditing(null); onChanged(); }}
                    />
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto p-5 space-y-2">
                            {panels.length === 0 ? (
                                <div className="text-center py-10 text-sm text-slate-400">
                                    <Layers className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                                    ยังไม่มีแพ็กเกจ — กด "สร้างแพ็กเกจใหม่" เพื่อเริ่ม
                                </div>
                            ) : panels.map((p) => {
                                const profit = p.price - p.cost;
                                const pct = p.price > 0 ? Math.round((profit / p.price) * 100) : 0;
                                return (
                                    <div key={p.id} className={`rounded-xl border p-3 ${p.is_active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800">{p.name}</span>
                                                    {!p.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 font-bold">ปิดใช้</span>}
                                                </div>
                                                <div className="text-[11px] text-slate-500 mt-0.5">{p.items.map((i) => i.name).join(" · ") || "— ยังไม่มีเทสย่อย —"}</div>
                                                <div className="text-[10px] text-slate-400 mt-1">{p.items.length} รายการ · รอผล {p.result_days} วัน{p.note ? ` · ${p.note}` : ""}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="font-black text-slate-800 tabular-nums">{baht(p.price)}</div>
                                                <div className="text-[10px] text-emerald-600 font-bold">กำไร {baht(profit)} ({pct}%)</div>
                                                <div className="flex gap-1 mt-1.5 justify-end">
                                                    <button onClick={() => setEditing(p)} className="h-7 w-7 rounded-lg border border-slate-200 inline-flex items-center justify-center hover:bg-slate-50" title="แก้ไข"><Pencil className="h-3.5 w-3.5 text-slate-500" /></button>
                                                    <button onClick={() => del(p)} disabled={busy} className="h-7 w-7 rounded-lg border border-rose-200 inline-flex items-center justify-center hover:bg-rose-50" title="ลบ"><Trash2 className="h-3.5 w-3.5 text-rose-500" /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="border-t border-slate-100 p-4 flex justify-end">
                            <button onClick={() => setEditing("new")}
                                className="h-10 px-5 rounded-xl text-sm font-bold text-white shadow-sm inline-flex items-center gap-1.5"
                                style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                                <Plus className="h-4 w-4" /> สร้างแพ็กเกจใหม่
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function PanelForm({
    panel, services, onCancel, onSaved,
}: {
    panel: AnonPanel | null;
    services: LabService[];
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(panel?.name || "");
    const [note, setNote] = useState(panel?.note || "");
    const [price, setPrice] = useState(panel ? String(panel.price) : "");
    const [cost, setCost] = useState(panel ? String(panel.cost) : "");
    const [days, setDays] = useState(panel ? String(panel.result_days) : "1");
    const [active, setActive] = useState(panel ? panel.is_active : true);
    const [sel, setSel] = useState<Set<string>>(new Set(panel?.items.map((i) => i.service_id) || []));
    const [err, setErr] = useState("");
    const [saving, startSave] = useTransition();

    const grouped = useMemo(() => {
        const m = new Map<string, LabService[]>();
        services.forEach((sv) => { const a = m.get(sv.item_type) || []; a.push(sv); m.set(sv.item_type, a); });
        return [...m.entries()];
    }, [services]);

    const sumParts = useMemo(() => services.filter((sv) => sel.has(sv.id)).reduce((x, sv) => x + sv.price, 0), [services, sel]);
    const priceN = Number(price) || 0;
    const costN = Number(cost) || 0;
    const profit = priceN - costN;
    const pct = priceN > 0 ? Math.round((profit / priceN) * 100) : 0;

    function toggle(id: string) {
        setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }

    function submit() {
        setErr("");
        if (!name.trim()) { setErr("กรุณาใส่ชื่อแพ็กเกจ"); return; }
        if (sel.size === 0) { setErr("กรุณาเลือกเทสย่อยอย่างน้อย 1 รายการ"); return; }
        startSave(async () => {
            const payload = { name, note, price: priceN, cost: costN, result_days: Number(days) || 1, serviceIds: [...sel] };
            const res = panel
                ? await updateAnonPanel(panel.id, { ...payload, is_active: active })
                : await createAnonPanel(payload);
            if (res.ok) onSaved(); else setErr(res.error);
        });
    }

    return (
        <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">ชื่อแพ็กเกจ *</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น STI BASIC"
                        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#2B54F0] focus:outline-none" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">ราคาขาย (฿)</label>
                        <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0"
                            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#2B54F0] focus:outline-none" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">ต้นทุน (฿)</label>
                        <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0"
                            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#2B54F0] focus:outline-none" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">รอผล (วัน)</label>
                        <input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} placeholder="1"
                            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#2B54F0] focus:outline-none" />
                    </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                    <span className="text-slate-500">ราคารวมถ้าซื้อแยก <b className="text-slate-700 tabular-nums">{baht(sumParts)}</b></span>
                    <span className="text-emerald-600 font-bold">กำไร {baht(profit)} ({pct}%)</span>
                </div>

                <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">หมายเหตุ (ไม่บังคับ)</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น รวมค่าเจาะเลือด"
                        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#2B54F0] focus:outline-none" />
                </div>

                <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1.5 block">เทสย่อยในแพ็กเกจ * <span className="text-slate-400 font-normal">(เลือกจากรายการบริการ)</span></label>
                    {services.length === 0 ? (
                        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">ยังไม่มีรายการบริการ — เพิ่มที่ ตั้งค่า → รายการบริการ &amp; ราคา</p>
                    ) : (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
                            {grouped.map(([type, list]) => (
                                <div key={type}>
                                    <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">{ITEM_TYPE_LABEL[type] || type}</div>
                                    {list.map((sv) => {
                                        const on = sel.has(sv.id);
                                        return (
                                            <button key={sv.id} type="button" onClick={() => toggle(sv.id)}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 ${on ? "bg-[#2B54F0]/5" : ""}`}>
                                                <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-[#2B54F0] border-[#2B54F0]" : "border-slate-300"}`}>{on && <CheckCircle2 className="h-3 w-3 text-white" />}</span>
                                                <span className="flex-1 text-sm text-slate-700">{sv.name}</span>
                                                <span className="text-xs font-semibold text-slate-500 tabular-nums">{baht(sv.price)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {panel && (
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#2B54F0]" />
                        <span className="text-sm font-semibold text-slate-700">เปิดใช้งานแพ็กเกจนี้</span>
                    </label>
                )}

                {err && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{err}</p>}
            </div>
            <div className="border-t border-slate-100 p-4 flex items-center justify-between gap-3">
                <button onClick={onCancel} className="h-10 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5"><ArrowRight className="h-4 w-4 rotate-180" /> กลับ</button>
                <button onClick={submit} disabled={saving}
                    className="h-10 px-5 rounded-xl text-sm font-bold text-white shadow-sm inline-flex items-center gap-1.5 disabled:opacity-60"
                    style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {panel ? "บันทึกการแก้ไข" : "สร้างแพ็กเกจ"}
                </button>
            </div>
        </>
    );
}
