export type PaymentMethod = "cash" | "transfer" | "credit_card";
export type PaymentRow = { method: PaymentMethod; amount: string; reference?: string };
export type PaymentEntry = { method: PaymentMethod; amount: number; reference?: string };
export type PaymentDraft = { mode: "full" | "deposit" | "unpaid"; deposit: string; rows: PaymentRow[] };
export type PaymentPlan = { paid: number; outstanding: number; change: number; payments: PaymentEntry[] };

// คำนวณเป็นสตางค์ ไม่บวกเงินด้วยทศนิยม floating point
export function cents(value: string | number): number {
    const text = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw Error("กรอกจำนวนเงินตั้งแต่ 0 และทศนิยมไม่เกิน 2 ตำแหน่ง");
    const [whole, fraction = ""] = text.split(".");
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(result) || result > 99999999999) throw Error("จำนวนเงินสูงเกินกำหนด");
    return result;
}
export function paymentPlan(total: number, draft: PaymentDraft): PaymentPlan {
    const totalCents = cents(total);
    const target = draft.mode === "unpaid" ? 0 : draft.mode === "deposit" ? cents(draft.deposit) : totalCents;
    if (draft.mode === "deposit" && (target <= 0 || target >= totalCents)) throw Error("เงินมัดจำต้องมากกว่า 0 และน้อยกว่ายอดสุทธิ");
    if (draft.mode === "unpaid") return { paid: 0, outstanding: total, change: 0, payments: [] };
    if (!draft.rows.length || draft.rows.length > 3) throw Error("เลือกช่องทางรับเงินอย่างน้อย 1 ช่องทาง");
    const seen = new Set<string>();
    const rows = draft.rows.map(row => {
        if (!["cash", "transfer", "credit_card"].includes(row.method) || seen.has(row.method)) throw Error("ช่องทางรับเงินไม่ถูกต้องหรือซ้ำกัน");
        seen.add(row.method);
        return { ...row, satang: cents(row.amount) };
    });
    const tendered = rows.reduce((sum, row) => sum + row.satang, 0);
    const cash = rows.find(r => r.method === "cash")?.satang || 0;
    if (tendered < target) throw Error(`ยอดรับเงินยังขาด ${((target - tendered) / 100).toFixed(2)} บาท`);
    const change = tendered - target;
    if (change > cash) throw Error("ยอดโอนและบัตรรวมกันเกินยอดที่รับครั้งนี้ กรุณาแก้จำนวนเงิน");
    const payments = rows.map(r => ({ method: r.method, amount: (r.satang - (r.method === "cash" ? change : 0)) / 100, reference: r.reference?.trim() || undefined })).filter(r => r.amount > 0);
    return { paid: target / 100, outstanding: (totalCents - target) / 100, change: change / 100, payments };
}
export function validatePayments(total: number, paid: number, payments: PaymentEntry[]) {
    const totalCents = cents(total), paidCents = cents(paid);
    if (paidCents > totalCents || !Array.isArray(payments) || payments.length > 3) throw Error("ยอดรับเงินไม่ถูกต้อง");
    const seen = new Set<string>();
    let sum = 0;
    for (const row of payments) {
        if (!["cash", "transfer", "credit_card"].includes(row.method) || seen.has(row.method)) throw Error("ช่องทางรับเงินไม่ถูกต้องหรือซ้ำกัน");
        seen.add(row.method);
        const amount = cents(row.amount);
        if (amount <= 0) throw Error("ยอดรับแต่ละช่องทางต้องมากกว่า 0");
        if (row.reference != null && (typeof row.reference !== "string" || row.reference.length > 200)) throw Error("เลขอ้างอิงยาวเกินกำหนด");
        sum += amount;
    }
    if (sum !== paidCents) throw Error("ยอดแยกช่องทางไม่ตรงกับยอดรับเงินรวม");
}
