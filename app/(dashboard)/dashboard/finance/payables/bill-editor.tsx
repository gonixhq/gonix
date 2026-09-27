"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Sparkles, Trash2, Plus, UploadCloud, FileText, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";
import { scanBillDocument } from "@/lib/actions/bill-scan";
import { getBillAttachmentUrl, type BillAttachment, type VendorRow } from "@/lib/actions/payables";
import { BILL_TYPE_LABEL, EXPENSE_CATEGORIES, DOC_TYPE_LABEL, WHT_OPTIONS, type BillType } from "@/lib/payables";
import { type BillForm, type FormLine, calcBill, emptyLine, shrinkImage, addDays, daysBetween, money, r2 } from "./bill-utils";

// หน้าบันทึกค่าใช้จ่ายแบบ FlowAccount / AutoKey — ซ้าย: เอกสาร · ขวา: ฟอร์ม
type Doc = { key: string; name: string; url: string | null; isPdf: boolean; kind: "new"; idx: number } | { key: string; name: string; url: string | null; isPdf: boolean; kind: "old"; att: BillAttachment };

export default function BillEditor({ form, setForm, month, vendors, expected, pending, onSave, onDeleteAttachment }: {
    form: BillForm; setForm: (f: BillForm | null) => void; month: string; vendors: VendorRow[]; expected?: number; pending: boolean;
    onSave: () => void; onDeleteAttachment: (a: BillAttachment) => void;
}) {
    const c = calcBill(form);
    const set = (patch: Partial<BillForm>) => setForm({ ...form, ...patch });
    const [scanning, setScanning] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const scanRef = useRef<HTMLInputElement>(null);
    const addRef = useRef<HTMLInputElement>(null);
    const isExpense = form.bill_type === "expense";
    const vatOn = form.vat_mode !== "none";
    const priceIncl = form.vat_mode === "incl";

    useEffect(() => { if (form.autoScan) { set({ autoScan: false }); scanRef.current?.click(); } }); // eslint-disable-line react-hooks/exhaustive-deps

    // ── เอกสารฝั่งซ้าย (ไฟล์ใหม่ = object URL · ไฟล์เดิม = signed URL) ──
    const newUrls = useMemo(() => form.files.map(f => URL.createObjectURL(f)), [form.files]);
    useEffect(() => () => newUrls.forEach(u => URL.revokeObjectURL(u)), [newUrls]);
    const [oldUrls, setOldUrls] = useState<Record<string, string>>({});
    useEffect(() => {
        form.attachments.filter(a => !oldUrls[a.path]).forEach(async a => {
            const r = await getBillAttachmentUrl(a.path);
            if (r.ok && r.url) setOldUrls(p => ({ ...p, [a.path]: r.url! }));
        });
    }, [form.attachments]); // eslint-disable-line react-hooks/exhaustive-deps
    const docs: Doc[] = [
        ...form.attachments.map(a => ({ key: a.path, name: a.name, url: oldUrls[a.path] || null, isPdf: (a.type || a.name).toLowerCase().includes("pdf"), kind: "old" as const, att: a })),
        ...form.files.map((f, i) => ({ key: `new-${i}-${f.name}`, name: f.name, url: newUrls[i] || null, isPdf: f.type === "application/pdf", kind: "new" as const, idx: i })),
    ];
    const [cur, setCur] = useState(0);
    const doc = docs[Math.min(cur, docs.length - 1)];
    const addFiles = (fl: File[]) => { if (!fl.length) return; set({ files: [...form.files, ...fl] }); setCur(docs.length); };

    // ── ผู้ขาย ──
    const vendorList = vendors.filter(v => v.is_active && v.vendor_type === form.bill_type);
    const pickVendor = (name: string) => {
        const v = vendors.find(x => x.name === name);
        set({ vendor: name, due_date: v ? addDays(form.bill_date, v.credit_days) : form.due_date,
            vendor_tax_id: v?.tax_id ?? form.vendor_tax_id, vendor_branch: v?.branch ?? form.vendor_branch, vendor_address: v?.address ?? form.vendor_address });
    };
    const known = vendors.find(v => v.name === form.vendor);

    // ── รายการ ──
    const setLine = (i: number, patch: Partial<FormLine>) => set({ lines: form.lines.map((l, j) => j === i ? { ...l, ...patch } : l) });
    const setVat = (on: boolean, incl: boolean) => set({ vat_mode: on ? (incl ? "incl" : "excl") : "none" });

    // ── สแกน AI ──
    const runScan = async (raw: File) => {
        setScanning(true);
        try {
            const file = await shrinkImage(raw);
            const fd = new FormData(); fd.append("file", file);
            const res = await scanBillDocument(fd);
            if (!res.ok || !res.data) { toast.error(res.error || "สแกนไม่สำเร็จ"); set({ files: [...form.files, file] }); return; }
            const d = res.data;
            const kv = (d.vendor_tax_id && vendors.find(v => v.tax_id === d.vendor_tax_id)) || (d.vendor_name && vendors.find(v => v.name === d.vendor_name)) || null;
            const billType: BillType = form.id ? form.bill_type : (kv?.vendor_type || d.bill_type);
            const billDate = d.bill_date || form.bill_date;
            const cat = d.expense_category || "other";
            const vm = d.vat_mode;
            // รายการจาก AI (amount = ยอดต่อบรรทัด) · ไม่มีรายการ → 1 บรรทัดจากยอด
            let lines: FormLine[] = d.items.filter(i => i.description).map(i => {
                const q = i.qty && i.qty > 0 ? i.qty : 1;
                return { description: i.description, category: cat, qty: String(q), unit_price: i.amount != null ? String(r2(i.amount / q)) : "" };
            });
            const base = vm === "excl" ? (d.subtotal ?? (d.total != null ? r2(d.total / 1.07) : null)) : (d.total ?? d.subtotal);
            const sumLines = lines.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
            if (!lines.length || (base != null && Math.abs(sumLines - base) > 1 && sumLines < base)) {
                // รายการไม่ครบ/อ่านราคาไม่ได้ → ใช้ยอดรวมเป็น 1 บรรทัด (เก็บชื่อรายการไว้ในรายละเอียด)
                lines = [{ description: lines.map(l => l.description).slice(0, 3).join(", ") || "ตามเอกสารแนบ", category: cat, qty: "1", unit_price: base != null ? String(base) : "" }];
            }
            const discount = base != null && sumLines > base + 1 && lines.length > 1 ? String(r2(sumLines - base)) : "";
            setForm({
                ...form, bill_type: billType, vendor: kv?.name || d.vendor_name || form.vendor, invoice_no: d.invoice_no || form.invoice_no,
                doc_type: d.doc_type || form.doc_type, bill_date: billDate, due_date: d.due_date || addDays(billDate, kv?.credit_days ?? (billType === "expense" ? 7 : 30)),
                vat_mode: vm, wht_pct: WHT_OPTIONS.some(o => o.value === d.wht_pct) ? Number(d.wht_pct) : 0, category: cat, lines, discount,
                vendor_tax_id: d.vendor_tax_id || kv?.tax_id || null, vendor_branch: d.vendor_branch || kv?.branch || null, vendor_address: d.vendor_address || kv?.address || null,
                files: [...form.files, file], scan: { confidence: d.confidence, warnings: d.warnings, checkTotal: d.total },
            });
            setCur(docs.length);
            toast.success("อ่านเอกสารแล้ว — ตรวจความถูกต้องก่อนบันทึก");
        } finally { setScanning(false); }
    };

    const canSave = !!form.vendor.trim() && c.total > 0 && form.lines.some(l => Number(l.unit_price) > 0);
    const inputCls = "h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-violet-500 focus:outline-none";

    return (
        <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col">
            {/* แถบบน */}
            <div className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-4">
                <button onClick={() => setForm(null)} className="h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center" aria-label="ปิด"><X className="h-5 w-5 text-slate-500" /></button>
                <h2 className="font-bold text-slate-800 truncate">{form.id ? "แก้ไขค่าใช้จ่าย" : "สร้างค่าใช้จ่าย"} <span className="text-sm font-normal text-slate-400">· เดือน {month}</span></h2>
                <div className="hidden md:flex ml-4 rounded-lg bg-slate-100 p-0.5">
                    {(["expense", "supplier", "lab"] as BillType[]).map(t => (
                        <button key={t} disabled={!!form.id} onClick={() => set({ bill_type: t, vendor: "" })}
                            className={`h-8 px-3 rounded-md text-xs font-semibold ${form.bill_type === t ? "bg-white shadow text-violet-700" : "text-slate-500"} disabled:cursor-default`}>{BILL_TYPE_LABEL[t]}</button>
                    ))}
                </div>
                <div className="flex-1" />
                <button onClick={() => setForm(null)} className="h-9 px-4 rounded-lg text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
                <button disabled={pending || scanning || !canSave} onClick={onSave}
                    className="h-9 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก
                </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                {/* ── ซ้าย: เอกสาร ── */}
                <div className={`lg:w-[46%] shrink-0 bg-slate-600 flex flex-col min-h-[260px] lg:min-h-0 ${dragOver ? "ring-4 ring-inset ring-violet-400" : ""}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files || [])); }}>
                    <div className="h-11 shrink-0 flex items-center gap-2 px-3 text-white/90 text-xs">
                        <span>ไฟล์ทั้งหมด: {docs.length}</span>
                        {docs.length > 1 && <>
                            <button onClick={() => setCur(i => Math.max(0, i - 1))} className="h-7 w-7 rounded hover:bg-white/10 flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button>
                            <span>{Math.min(cur, docs.length - 1) + 1}/{docs.length}</span>
                            <button onClick={() => setCur(i => Math.min(docs.length - 1, i + 1))} className="h-7 w-7 rounded hover:bg-white/10 flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button>
                        </>}
                        <span className="flex-1 truncate text-white/60">{doc?.name}</span>
                        {doc && <button onClick={() => {
                            if (doc.kind === "new") { set({ files: form.files.filter((_, j) => j !== doc.idx) }); setCur(0); }
                            else if (confirm(`ลบไฟล์ ${doc.name}?`)) { onDeleteAttachment(doc.att); setCur(0); }
                        }} className="h-7 w-7 rounded hover:bg-white/10 flex items-center justify-center" aria-label="ลบไฟล์"><Trash2 className="h-4 w-4" /></button>}
                        <button onClick={() => addRef.current?.click()} className="h-7 px-2 rounded bg-white/10 hover:bg-white/20 inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> เพิ่มไฟล์</button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3">
                        {!doc ? (
                            <button onClick={() => addRef.current?.click()} className="text-center text-white/90 space-y-3 max-w-xs">
                                <UploadCloud className="h-16 w-16 mx-auto text-white/70" />
                                <div className="font-semibold">กดที่นี่ หรือลากไฟล์มาวาง เพื่ออัปโหลดเอกสาร</div>
                                <div className="text-xs text-white/60">รูปถ่ายบิล / ใบกำกับภาษี / PDF · ใช้ส่งสำนักงานบัญชี</div>
                            </button>
                        ) : !doc.url ? <Loader2 className="h-8 w-8 animate-spin text-white/70" />
                            : doc.isPdf ? <iframe src={doc.url} title={doc.name} className="w-full h-full min-h-[400px] bg-white rounded" />
                            // eslint-disable-next-line @next/next/no-img-element
                            : <img src={doc.url} alt={doc.name} className="max-w-full max-h-full object-contain rounded shadow-lg bg-white" />}
                    </div>
                    <div className="shrink-0 p-3 border-t border-white/10">
                        <button disabled={scanning} onClick={() => scanRef.current?.click()}
                            className="w-full h-10 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-70">
                            {scanning ? <><Loader2 className="h-4 w-4 animate-spin" /> AI กำลังอ่านเอกสาร…</> : <><Sparkles className="h-4 w-4" /> สแกนบิลด้วย AI (ถ่ายรูป/เลือกไฟล์)</>}
                        </button>
                    </div>
                    <input ref={scanRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runScan(f); }} />
                    <input ref={addRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => { const fl = Array.from(e.target.files || []); e.target.value = ""; addFiles(fl); }} />
                </div>

                {/* ── ขวา: ฟอร์ม ── */}
                <div className="flex-1 min-h-0 overflow-y-auto bg-white">
                    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
                        {form.scan && (
                            <div className={`rounded-lg border p-3 text-xs space-y-0.5 ${form.scan.confidence === "high" && !form.scan.warnings.length ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                                <div className="font-semibold inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> AI อ่านแล้ว (มั่นใจ{form.scan.confidence === "high" ? "สูง" : form.scan.confidence === "medium" ? "ปานกลาง" : "ต่ำ"}) — ตรวจทุกช่องก่อนบันทึก</div>
                                {form.scan.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                                {form.scan.checkTotal != null && Math.abs(form.scan.checkTotal - c.total) > 1 && <div>⚠ ยอดในเอกสาร {money(form.scan.checkTotal)} ≠ ที่คำนวณ {money(c.total)}</div>}
                            </div>
                        )}
                        <div className="md:hidden flex rounded-lg bg-slate-100 p-0.5">
                            {(["expense", "supplier", "lab"] as BillType[]).map(t => (
                                <button key={t} disabled={!!form.id} onClick={() => set({ bill_type: t, vendor: "" })}
                                    className={`flex-1 h-8 rounded-md text-xs font-semibold ${form.bill_type === t ? "bg-white shadow text-violet-700" : "text-slate-500"}`}>{BILL_TYPE_LABEL[t]}</button>
                            ))}
                        </div>

                        {/* หัวเอกสาร */}
                        <div className="grid grid-cols-2 gap-3">
                            <F label="หัวเอกสาร">
                                <select value={form.doc_type} onChange={e => set({ doc_type: e.target.value })} className={inputCls}>
                                    {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </F>
                            <F label="เลขที่เอกสาร"><input value={form.invoice_no} onChange={e => set({ invoice_no: e.target.value })} className={inputCls} /></F>
                            <F label="วันที่"><input type="date" value={form.bill_date} onChange={e => set({ bill_date: e.target.value, due_date: addDays(e.target.value, known?.credit_days ?? daysBetween(form.bill_date, form.due_date)) })} className={inputCls} /></F>
                            <F label={`ครบกำหนดชำระ (เครดิต ${daysBetween(form.bill_date, form.due_date)} วัน)`}><input type="date" value={form.due_date} onChange={e => set({ due_date: e.target.value })} className={inputCls} /></F>
                        </div>

                        {/* ผู้จำหน่าย */}
                        <div className="space-y-1">
                            <div className="text-xs font-semibold text-slate-600">ข้อมูลผู้จำหน่าย</div>
                            <div className="rounded-md border border-slate-300 overflow-hidden divide-y divide-slate-200">
                                <input list="bill-vendors" value={form.vendor} onChange={e => pickVendor(e.target.value)} placeholder={isExpense ? "ชื่อธุรกิจ (เช่น การไฟฟ้า, เจ้าของตึก)" : form.bill_type === "lab" ? "ชื่อแล็บ" : "ชื่อบริษัท"}
                                    className="h-10 w-full px-3 text-sm font-semibold focus:outline-none" />
                                <datalist id="bill-vendors">{vendorList.map(v => <option key={v.id} value={v.name} />)}</datalist>
                                <textarea value={form.vendor_address || ""} onChange={e => set({ vendor_address: e.target.value })} placeholder="ที่อยู่" rows={2} className="w-full px-3 py-2 text-sm resize-none focus:outline-none" />
                                <div className="grid grid-cols-2 divide-x divide-slate-200">
                                    <input value={form.vendor_tax_id || ""} onChange={e => set({ vendor_tax_id: e.target.value.replace(/\D/g, "").slice(0, 13) })} placeholder="เลขประจำตัวผู้เสียภาษี" className="h-9 px-3 text-sm tabular-nums focus:outline-none" />
                                    <input value={form.vendor_branch || ""} onChange={e => set({ vendor_branch: e.target.value })} placeholder="สำนักงานใหญ่ / สาขา" className="h-9 px-3 text-sm focus:outline-none" />
                                </div>
                            </div>
                            {known ? <p className="text-[11px] text-slate-400">ผู้ขายในทะเบียน · เครดิต {known.credit_days} วัน (แก้ข้อมูลผู้ขายที่แท็บ &quot;ผู้ขาย&quot;)</p>
                                : form.vendor.trim() && <p className="text-[11px] text-violet-600">ผู้ขายใหม่ — จะเพิ่มลงทะเบียนผู้ขายให้ตอนบันทึก</p>}
                        </div>

                        <F label="รายละเอียด"><input value={form.note} onChange={e => set({ note: e.target.value })} placeholder="เช่น ค่าไฟเดือนกันยายน" className={inputCls} /></F>

                        {/* รายการ */}
                        <div className="rounded-md border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                                    <th className="text-left px-2 py-2 w-8">#</th>
                                    <th className="text-left px-2">รายละเอียด</th>
                                    {isExpense && <th className="text-left px-2 w-44 hidden sm:table-cell">หมวดหมู่</th>}
                                    <th className="text-right px-2 w-16">จำนวน</th>
                                    <th className="text-right px-2 w-28">ราคา/หน่วย</th>
                                    <th className="text-right px-2 w-28">ยอดรวม</th>
                                    <th className="w-8" />
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {form.lines.map((l, i) => (
                                        <tr key={i} className="align-top">
                                            <td className="px-2 py-2 text-xs text-slate-400">{i + 1}</td>
                                            <td className="px-1 py-1">
                                                <input value={l.description} onChange={e => setLine(i, { description: e.target.value })} className="h-8 w-full rounded border border-transparent hover:border-slate-200 focus:border-violet-400 px-1.5 text-sm focus:outline-none" placeholder="รายการ" />
                                                {isExpense && (
                                                    <select value={l.category} onChange={e => setLine(i, { category: e.target.value })} className="sm:hidden mt-1 h-7 w-full rounded border border-slate-200 px-1 text-xs">
                                                        {EXPENSE_CATEGORIES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                                                    </select>
                                                )}
                                            </td>
                                            {isExpense && <td className="px-1 py-1 hidden sm:table-cell">
                                                <select value={l.category} onChange={e => setLine(i, { category: e.target.value })} className="h-8 w-full rounded border border-slate-200 px-1 text-xs">
                                                    {EXPENSE_CATEGORIES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                                                </select>
                                            </td>}
                                            <td className="px-1 py-1"><input type="number" min={0} value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} className="h-8 w-full rounded border border-slate-200 px-1.5 text-sm text-right tabular-nums" /></td>
                                            <td className="px-1 py-1"><input type="number" min={0} step="0.01" value={l.unit_price} onChange={e => setLine(i, { unit_price: e.target.value })} className="h-8 w-full rounded border border-slate-200 px-1.5 text-sm text-right tabular-nums" /></td>
                                            <td className="px-2 py-2 text-right tabular-nums">{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td>
                                            <td className="py-1">{form.lines.length > 1 && <button onClick={() => set({ lines: form.lines.filter((_, j) => j !== i) })} className="h-8 w-7 flex items-center justify-center text-slate-400 hover:text-rose-500" aria-label="ลบรายการ"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={() => set({ lines: [...form.lines, emptyLine(form.lines[form.lines.length - 1]?.category || "other")] })}
                                className="w-full h-9 text-sm text-violet-700 font-semibold hover:bg-violet-50 inline-flex items-center justify-center gap-1 border-t border-slate-100"><Plus className="h-4 w-4" /> เพิ่มรายการ</button>
                        </div>

                        {/* สรุปยอด */}
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-3 text-sm">
                                <div className="flex items-center gap-4">
                                    <span className="text-slate-600">ราคาสินค้า</span>
                                    <label className="inline-flex items-center gap-1.5"><input type="radio" checked={priceIncl} disabled={!vatOn} onChange={() => setVat(true, true)} /> รวมภาษี</label>
                                    <label className="inline-flex items-center gap-1.5"><input type="radio" checked={!priceIncl} disabled={!vatOn} onChange={() => setVat(true, false)} /> ไม่รวมภาษี</label>
                                </div>
                                {isExpense && (
                                    <label className="flex items-start gap-2 text-slate-600">
                                        <input type="checkbox" checked={form.in_pl} onChange={e => set({ in_pl: e.target.checked })} className="h-4 w-4 mt-0.5" />
                                        <span>นับเข้ารายงานกำไร <span className="block text-[11px] text-slate-400">เอาออก ถ้ารายการนี้ตั้งไว้ในต้นทุนคงที่แล้ว (เช่น ค่าเช่า)</span></span>
                                    </label>
                                )}
                                <div className="rounded-md border border-slate-200 p-3 space-y-2">
                                    <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={form.original_filed} onChange={e => set({ original_filed: e.target.checked })} className="h-4 w-4" /> เก็บต้นฉบับเข้าแฟ้มแล้ว</label>
                                    <input value={form.original_ref} onChange={e => set({ original_ref: e.target.value })} placeholder="แฟ้ม/ที่เก็บ เช่น แฟ้มค่าใช้จ่าย 2026/09" className={inputCls} />
                                </div>
                                {expected != null && (
                                    <div className={`text-xs inline-flex items-center gap-1 ${Math.abs(c.total - expected) <= 1 ? "text-emerald-600" : "text-amber-600"}`}>
                                        {Math.abs(c.total - expected) > 1 && <AlertTriangle className="h-3.5 w-3.5" />} ระบบคาด (ส่งตรวจเดือนนี้) {money(expected)} · ต่าง {money(c.total - expected)}
                                    </div>
                                )}
                            </div>
                            <div className="text-sm tabular-nums">
                                <Row label="รวมเป็นเงิน" value={money(c.gross)} />
                                <div className="flex items-center justify-between py-1.5">
                                    <span className="text-slate-600">ส่วนลด</span>
                                    <input type="number" min={0} step="0.01" value={form.discount} onChange={e => set({ discount: e.target.value })} placeholder="0.00" className="h-8 w-32 rounded border border-slate-300 px-2 text-right" />
                                </div>
                                <Row label="ราคาหลังหักส่วนลด" value={money(c.after)} muted />
                                <div className="flex items-center justify-between py-1.5">
                                    <label className="inline-flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={vatOn} onChange={e => setVat(e.target.checked, priceIncl)} className="h-4 w-4" /> ภาษีมูลค่าเพิ่ม 7%</label>
                                    <span>{money(c.vat)}</span>
                                </div>
                                {priceIncl && vatOn && <Row label="มูลค่าก่อนภาษี" value={money(c.subtotal)} muted />}
                                <div className="flex items-center justify-between py-2 border-t border-slate-200 font-bold text-slate-900">
                                    <span>จำนวนเงินรวมทั้งสิ้น</span><span className="text-lg">{money(c.total)}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5 gap-2">
                                    <select value={form.wht_pct} onChange={e => set({ wht_pct: Number(e.target.value) })} className="h-8 rounded border border-slate-300 px-1 text-xs text-slate-600">
                                        {WHT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value ? `หัก ณ ที่จ่าย ${o.label}` : "ไม่หัก ณ ที่จ่าย"}</option>)}
                                    </select>
                                    <span className={c.wht ? "text-rose-600" : "text-slate-400"}>{c.wht ? `−${money(c.wht)}` : "—"}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 rounded-md bg-emerald-50 px-2 font-bold text-emerald-800">
                                    <span>ยอดชำระ</span><span className="text-lg">{money(c.net)}</span>
                                </div>
                            </div>
                        </div>
                        {!docs.length && (
                            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 inline-flex items-center gap-2">
                                <FileText className="h-4 w-4" /> ยังไม่มีรูปเอกสาร — แนบที่ฝั่งซ้าย (ต้องใช้ส่งสำนักงานบัญชี)
                            </div>
                        )}
                        <div className="h-4" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block text-xs text-slate-600 space-y-1"><span className="font-semibold">{label}</span>{children}</label>;
}
function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
    return <div className={`flex items-center justify-between py-1.5 ${muted ? "text-slate-500" : "text-slate-700"}`}><span>{label}</span><span>{value}</span></div>;
}
