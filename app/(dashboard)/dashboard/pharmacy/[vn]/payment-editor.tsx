"use client";
import { type PaymentDraft, type PaymentMethod, type PaymentRow, paymentPlan } from "@/lib/checkout-payment";
import { CARD_TYPES, INSTALLMENT_OPTIONS, type CardType } from "@/lib/card-fees";
const methods: { value: PaymentMethod; label: string }[] = [{ value: "cash", label: "เงินสด" }, { value: "transfer", label: "QR / โอน" }, { value: "credit_card", label: "บัตร (เครดิต/เดบิต)" }];
const input = "w-full h-11 rounded-xl border border-slate-300 px-3 text-sm";
export default function PaymentEditor({ total, draft, onChange, disabled }: { total: number; draft: PaymentDraft; onChange: (d: PaymentDraft) => void; disabled: boolean }) {
    let plan; let error = "";
    try { plan = paymentPlan(total, draft); } catch (e) { error = (e as Error).message; }
    function setMode(mode: PaymentDraft["mode"], deposit = draft.deposit) {
        const amount = mode === "full" ? String(total) : deposit;
        onChange({ mode, deposit, rows: draft.rows.map((r, i) => ({ ...r, amount: i === 0 ? amount : "0" })) });
    }
    const patchRow = (i: number, patch: Partial<PaymentRow>) => onChange({ ...draft, rows: draft.rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
    return <fieldset disabled={disabled} className="space-y-4 border-t border-slate-200 pt-4 min-w-0">
        <legend className="text-sm font-semibold text-slate-800">รับชำระครั้งนี้</legend>
        <div className="grid grid-cols-3 gap-2">{([{ value: "full", label: "เต็มจำนวน" }, { value: "deposit", label: "มัดจำ (บาท)" }, { value: "unpaid", label: "ค้างทั้งหมด" }] as const).map(m => <button key={m.value} type="button" aria-pressed={draft.mode === m.value} onClick={() => setMode(m.value)} className={`rounded-xl border px-2 py-3 text-xs font-medium ${draft.mode === m.value ? "bg-blue-700 text-white border-blue-700" : "bg-white border-slate-200"}`}>{m.label}</button>)}</div>
        {draft.mode === "deposit" && <label className="block space-y-2 text-sm">จำนวนเงินมัดจำ (บาท)<input className={input} inputMode="decimal" value={draft.deposit} placeholder="เช่น 2000" onChange={e => setMode("deposit", e.target.value)} /><span className="flex gap-2">{[50, 30].map(percent => <button type="button" key={percent} className="rounded-lg bg-slate-100 px-3 py-1 text-xs" onClick={() => setMode("deposit", (Math.round(total * percent) / 100).toFixed(2))}>{percent}%</button>)}</span></label>}
        {draft.mode !== "unpaid" && <>
            <p className="text-xs text-slate-600">ช่องทางรับเงิน — เลือกได้มากกว่า 1 ช่องทาง</p>
            <div className="grid grid-cols-3 gap-2">{methods.map(m => { const selected = draft.rows.some(r => r.method === m.value); return <button type="button" key={m.value} aria-pressed={selected} className={`rounded-xl border px-2 py-3 text-xs ${selected ? "bg-blue-50 border-blue-500 text-blue-800" : "bg-white border-slate-200"}`} onClick={() => { if (selected && draft.rows.length === 1) return; onChange({ ...draft, rows: selected ? draft.rows.filter(r => r.method !== m.value) : [...draft.rows, { method: m.value, amount: "0" }] }); }}>{m.label}</button>; })}</div>
            {draft.rows.map((row, i) => <div key={row.method} className="space-y-2 rounded-xl border border-slate-200 p-3">
                <label className="block text-sm font-medium">{methods.find(m => m.value === row.method)?.label} (บาท)<input className={`${input} mt-2 tabular-nums`} inputMode="decimal" value={row.amount} onChange={e => patchRow(i, { amount: e.target.value })} /></label>
                {row.method === "credit_card" && <CardFields row={row} onPatch={(p) => patchRow(i, p)} />}
                {row.method !== "cash" && <input aria-label={`เลขอ้างอิง ${methods.find(m => m.value === row.method)?.label}`} className={input} maxLength={200} placeholder={row.method === "credit_card" ? "เลขอ้างอิงสลิปบัตร (ไว้กระทบยอด statement)" : "เลขอ้างอิง (ถ้ามี)"} value={row.reference || ""} onChange={e => patchRow(i, { reference: e.target.value })} />}
            </div>)}
        </>}
        {error ? <p role="status" className="text-sm text-amber-800">{error}</p> : plan && <dl className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm" aria-live="polite">{[["รับชำระครั้งนี้", plan.paid], ["เงินทอน (เงินสด)", plan.change], ["ค้างชำระ", plan.outstanding]].map(([label, amount]) => <div key={label} className="flex justify-between gap-2"><dt>{label}</dt><dd className="font-semibold tabular-nums">฿{Number(amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</dd></div>)}</dl>}
        {draft.mode !== "full" && <p className="text-xs text-slate-600">รับยอดค้างเพิ่มเติมได้ที่หน้าการเงินของใบเสร็จนี้</p>}
    </fieldset>;
}

export type CardPatch = { card_type?: CardType | ""; card_issuer?: "kbank" | "other"; installment_months?: number | null };

// ประเภทบัตร + ธนาคารผู้ออก + ผ่อน — ระบบคิดค่าธรรมเนียม (MDR) เองตามอัตราคลินิก ไม่เรียกเก็บเพิ่มจากลูกค้า
export function CardFields({ row, onPatch }: { row: CardPatch; onPatch: (p: CardPatch) => void }) {
    const issuer = row.card_issuer || "other";
    return <div className="space-y-2">
        <select aria-label="ประเภทบัตร" className={`${input} bg-white ${!row.card_type ? "border-amber-400" : ""}`} value={row.card_type || ""} onChange={e => onPatch({ card_type: e.target.value as CardType })}>
            <option value="">— เลือกประเภทบัตร —</option>
            {CARD_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
            {([["other", "ธนาคารอื่น"], ["kbank", "บัตรกสิกรไทย"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={issuer === v} onClick={() => onPatch({ card_issuer: v, installment_months: v === "kbank" ? row.installment_months ?? null : null })} className={`rounded-lg border px-2 py-2 text-xs ${issuer === v ? "bg-emerald-50 border-emerald-500 text-emerald-800 font-semibold" : "bg-white border-slate-200 text-slate-600"}`}>{l}</button>)}
        </div>
        {issuer === "kbank" && <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-slate-600">ผ่อน:</span>
            {[null, ...INSTALLMENT_OPTIONS].map(m => <button key={String(m)} type="button" aria-pressed={(row.installment_months ?? null) === m} onClick={() => onPatch({ installment_months: m })} className={`rounded-lg border px-2.5 py-1 ${(row.installment_months ?? null) === m ? "bg-blue-700 text-white border-blue-700" : "bg-white border-slate-200"}`}>{m == null ? "ไม่ผ่อน" : `${m} เดือน`}</button>)}
        </div>}
    </div>;
}
