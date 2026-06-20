"use server";

import { createClient } from "@/lib/supabase/server";

const round2 = (n: number) => Math.round(n * 100) / 100;
const EXCLUDE = new Set(["voided", "refunded", "draft"]);

export interface SalesTypeRow { type: string; amount: number; count: number; pct: number; }
export interface TopItem { name: string; type: string; qty: number; amount: number; }
export interface RfmSegment { key: string; label: string; color: string; customers: number; revenue: number; }
export interface RfmCustomer { hn: string; name: string; recencyDays: number; frequency: number; monetary: number; r: number; f: number; m: number; segment: string; }

export interface BusinessInsights {
    // overview
    totalRevenue: number;
    invoiceCount: number;
    uniqueCustomers: number;
    avgPerInvoice: number;
    newCustomers: number;
    returningCustomers: number;
    newRevenue: number;
    returningRevenue: number;
    // breakdowns
    salesByType: SalesTypeRow[];
    topItems: TopItem[];
}

const ITEM_TYPE_LABEL: Record<string, string> = {
    drug: "ยา", supply: "เวชภัณฑ์", service: "บริการ/หัตถการ", package: "คอส/แพ็กเกจ",
    lab: "แล็บ", procedure: "หัตถการ", fee: "ค่าธรรมเนียม/DF", other: "อื่นๆ",
};
export async function getItemTypeLabel(t: string) { return ITEM_TYPE_LABEL[t] || t; }

/** ภาพรวม + sales by type + top items ในช่วงวันที่ */
export async function getBusinessInsights(startDate: string, endDate: string): Promise<BusinessInsights> {
    const supabase = await createClient();

    // 1) ใบเสร็จในช่วง (ตัด voided/refunded/draft)
    const { data: invoices } = await supabase
        .from("invoice_headers")
        .select("id, hn, invoice_date, total_amount, status")
        .gte("invoice_date", startDate).lte("invoice_date", endDate);
    const valid = (invoices || []).filter((i) => !EXCLUDE.has(i.status as string));

    const totalRevenue = round2(valid.reduce((s, i) => s + Number(i.total_amount || 0), 0));
    const invoiceCount = valid.length;
    const custSet = new Set(valid.map((i) => i.hn as string));
    const uniqueCustomers = custSet.size;
    const avgPerInvoice = invoiceCount > 0 ? round2(totalRevenue / invoiceCount) : 0;

    // 2) ลูกค้าเก่า vs ใหม่ — ใหม่ = ไม่เคยมีใบเสร็จก่อนช่วงนี้
    const { data: prior } = await supabase
        .from("invoice_headers")
        .select("hn")
        .lt("invoice_date", startDate);
    const priorHns = new Set((prior || []).map((p) => p.hn as string));
    let newRevenue = 0, returningRevenue = 0;
    const newCust = new Set<string>(), retCust = new Set<string>();
    valid.forEach((i) => {
        const hn = i.hn as string;
        const amt = Number(i.total_amount || 0);
        if (priorHns.has(hn)) { returningRevenue += amt; retCust.add(hn); }
        else { newRevenue += amt; newCust.add(hn); }
    });

    // 3) รายการในใบเสร็จช่วงนี้ (join เพื่อกรองตามวันที่/สถานะ)
    const { data: items } = await supabase
        .from("invoice_items")
        .select("item_type, item_name, qty, line_total, invoice_headers!inner(invoice_date, status)")
        .gte("invoice_headers.invoice_date", startDate)
        .lte("invoice_headers.invoice_date", endDate);

    const byType = new Map<string, { amount: number; count: number }>();
    const byItem = new Map<string, { type: string; qty: number; amount: number }>();
    (items || []).forEach((it) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = Array.isArray((it as any).invoice_headers) ? (it as any).invoice_headers[0] : (it as any).invoice_headers;
        if (h && EXCLUDE.has(h.status)) return;
        const type = (it.item_type as string) || "other";
        const amt = Number(it.line_total || 0);
        const qty = Number(it.qty || 0);
        const tt = byType.get(type) || { amount: 0, count: 0 };
        tt.amount += amt; tt.count += 1; byType.set(type, tt);
        const name = (it.item_name as string) || "—";
        const ii = byItem.get(name) || { type, qty: 0, amount: 0 };
        ii.qty += qty; ii.amount += amt; byItem.set(name, ii);
    });

    const typeTotal = [...byType.values()].reduce((s, v) => s + v.amount, 0) || 1;
    const salesByType: SalesTypeRow[] = [...byType.entries()]
        .map(([type, v]) => ({ type, amount: round2(v.amount), count: v.count, pct: round2((v.amount / typeTotal) * 100) }))
        .sort((a, b) => b.amount - a.amount);

    const topItems: TopItem[] = [...byItem.entries()]
        .map(([name, v]) => ({ name, type: v.type, qty: round2(v.qty), amount: round2(v.amount) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 15);

    return {
        totalRevenue, invoiceCount, uniqueCustomers, avgPerInvoice,
        newCustomers: newCust.size, returningCustomers: retCust.size,
        newRevenue: round2(newRevenue), returningRevenue: round2(returningRevenue),
        salesByType, topItems,
    };
}

// ── RFM ──────────────────────────────────────────────
// แบ่งกลุ่มลูกค้าจาก Recency (ซื้อล่าสุดเมื่อไหร่) · Frequency (ซื้อกี่ครั้ง) · Monetary (ใช้จ่ายรวม)
const RFM_SEGMENTS: { key: string; label: string; color: string; test: (r: number, f: number) => boolean }[] = [
    { key: "champion", label: "ลูกค้าชั้นยอด", color: "emerald", test: (r, f) => r >= 4 && f >= 4 },
    { key: "loyal", label: "ลูกค้าประจำ", color: "green", test: (r, f) => r >= 3 && f >= 4 },
    { key: "potential", label: "มีแววประจำ", color: "cyan", test: (r, f) => r >= 4 && f >= 2 && f < 4 },
    { key: "new", label: "ลูกค้าใหม่", color: "blue", test: (r, f) => r >= 4 && f <= 1 },
    { key: "promising", label: "น่าจับตา", color: "indigo", test: (r, f) => r === 3 && f <= 1 },
    { key: "attention", label: "ต้องดูแล", color: "amber", test: (r, f) => r === 3 && f >= 2 && f < 4 },
    { key: "sleepy", label: "ใกล้หาย", color: "orange", test: (r, f) => r === 2 && f >= 2 },
    { key: "atrisk", label: "เสี่ยงหาย", color: "rose", test: (r, f) => r <= 2 && f >= 4 },
    { key: "cantlose", label: "ห้ามเสียไป", color: "red", test: (r, f) => r <= 1 && f >= 4 },
    { key: "hibernating", label: "หลับไหล", color: "slate", test: (r, f) => r <= 2 && f >= 2 && f < 4 },
    { key: "lost", label: "หายไปแล้ว", color: "slate", test: (r, f) => r <= 1 && f <= 2 },
];

function quintile(value: number, sortedAsc: number[]): number {
    // คืนคะแนน 1-5 ตาม percentile (5 = ดีสุด)
    if (sortedAsc.length === 0) return 3;
    const idx = sortedAsc.findIndex((v) => v >= value);
    const pos = idx < 0 ? sortedAsc.length - 1 : idx;
    return Math.min(5, Math.max(1, Math.ceil(((pos + 1) / sortedAsc.length) * 5)));
}

export interface RfmResult { segments: RfmSegment[]; customers: RfmCustomer[]; total: number; }

export async function getRfmAnalysis(): Promise<RfmResult> {
    const supabase = await createClient();
    const { data: invoices } = await supabase
        .from("invoice_headers")
        .select("hn, invoice_date, total_amount, status");
    const valid = (invoices || []).filter((i) => !EXCLUDE.has(i.status as string));

    // aggregate per hn
    const agg = new Map<string, { last: string; freq: number; monetary: number }>();
    valid.forEach((i) => {
        const hn = i.hn as string;
        const a = agg.get(hn) || { last: "0000-00-00", freq: 0, monetary: 0 };
        a.freq += 1; a.monetary += Number(i.total_amount || 0);
        if ((i.invoice_date as string) > a.last) a.last = i.invoice_date as string;
        agg.set(hn, a);
    });
    if (agg.size === 0) return { segments: RFM_SEGMENTS.map((s) => ({ key: s.key, label: s.label, color: s.color, customers: 0, revenue: 0 })), customers: [], total: 0 };

    const today = new Date();
    const hns = [...agg.keys()];
    const recencyArr: number[] = [], freqArr: number[] = [], monArr: number[] = [];
    const base = hns.map((hn) => {
        const a = agg.get(hn)!;
        const recencyDays = Math.max(0, Math.round((today.getTime() - new Date(a.last + "T00:00:00").getTime()) / 86400000));
        recencyArr.push(recencyDays); freqArr.push(a.freq); monArr.push(round2(a.monetary));
        return { hn, recencyDays, frequency: a.freq, monetary: round2(a.monetary) };
    });
    // recency: น้อย=ดี → กลับด้าน, frequency/monetary: มาก=ดี
    const recSorted = [...recencyArr].sort((a, b) => b - a); // มากสุดอยู่ต้น → quintile ต่ำ
    const freqSorted = [...freqArr].sort((a, b) => a - b);
    const monSorted = [...monArr].sort((a, b) => a - b);

    // ชื่อผู้ป่วย
    const { data: pts } = await supabase.from("patients").select("hn, first_name, last_name").in("hn", hns);
    const nameMap = new Map((pts || []).map((p) => [p.hn as string, `${p.first_name} ${p.last_name}`]));

    const segCount = new Map<string, { customers: number; revenue: number }>();
    const customers: RfmCustomer[] = base.map((b) => {
        const r = quintile(b.recencyDays, recSorted);       // recencyDays มาก → score ต่ำ (เพราะ recSorted desc)
        const f = quintile(b.frequency, freqSorted);
        const m = quintile(b.monetary, monSorted);
        const seg = RFM_SEGMENTS.find((s) => s.test(r, f)) || RFM_SEGMENTS[RFM_SEGMENTS.length - 1];
        const sc = segCount.get(seg.key) || { customers: 0, revenue: 0 };
        sc.customers += 1; sc.revenue += b.monetary; segCount.set(seg.key, sc);
        return { hn: b.hn, name: nameMap.get(b.hn) || b.hn, recencyDays: b.recencyDays, frequency: b.frequency, monetary: b.monetary, r, f, m, segment: seg.key };
    });

    const segments: RfmSegment[] = RFM_SEGMENTS.map((s) => {
        const sc = segCount.get(s.key) || { customers: 0, revenue: 0 };
        return { key: s.key, label: s.label, color: s.color, customers: sc.customers, revenue: round2(sc.revenue) };
    });

    return { segments, customers: customers.sort((a, b) => b.monetary - a.monetary), total: customers.length };
}

// ── เฟส 2: Market Basket + Next-purchase ─────────────
// co-occurrence = สินค้าที่มักอยู่ในใบเสร็จเดียวกัน · transition = ซื้อ A แล้วครั้งถัดไปมักซื้อ B
export interface BasketPair {
    a: string; b: string;
    count: number;        // จำนวนใบเสร็จที่มีทั้ง A และ B
    lift: number;         // >1 = ซื้อคู่กันมากกว่าบังเอิญ
    confAtoB: number;     // % ของคนซื้อ A แล้วซื้อ B ด้วย
    confBtoA: number;
}
export interface PurchaseTransition {
    from: string; to: string;
    count: number;        // จำนวนครั้งที่เกิดลำดับนี้
    avgGapDays: number;   // เฉลี่ยกี่วันถึงกลับมาซื้อ
}
export interface BasketAnalysis {
    totalBaskets: number;
    multiItemBaskets: number;
    pairs: BasketPair[];
    transitions: PurchaseTransition[];
}

const SEP = "|~|";

export async function getBasketAnalysis(startDate: string, endDate: string): Promise<BasketAnalysis> {
    const supabase = await createClient();
    const { data: items } = await supabase
        .from("invoice_items")
        .select("item_name, invoice_headers!inner(id, hn, invoice_date, status)")
        .gte("invoice_headers.invoice_date", startDate)
        .lte("invoice_headers.invoice_date", endDate);

    // จัดกลุ่มรายการเป็น "ตะกร้า" ต่อใบเสร็จ
    const baskets = new Map<string, { hn: string; date: string; items: Set<string> }>();
    (items || []).forEach((it) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = Array.isArray((it as any).invoice_headers) ? (it as any).invoice_headers[0] : (it as any).invoice_headers;
        if (!h || EXCLUDE.has(h.status)) return;
        const name = ((it.item_name as string) || "").trim();
        if (!name) return;
        const id = h.id as string;
        const b = baskets.get(id) || { hn: h.hn as string, date: h.invoice_date as string, items: new Set<string>() };
        b.items.add(name);
        baskets.set(id, b);
    });

    const allBaskets = [...baskets.values()];
    const totalBaskets = allBaskets.length;
    const multiItemBaskets = allBaskets.filter((b) => b.items.size >= 2).length;

    // ── Co-occurrence (market basket) ──
    const itemCount = new Map<string, number>();
    const pairCount = new Map<string, number>();
    allBaskets.forEach((b) => {
        const arr = [...b.items].sort();
        arr.forEach((x) => itemCount.set(x, (itemCount.get(x) || 0) + 1));
        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                const key = arr[i] + SEP + arr[j];
                pairCount.set(key, (pairCount.get(key) || 0) + 1);
            }
        }
    });
    const N = totalBaskets || 1;
    const pairs: BasketPair[] = [...pairCount.entries()]
        .filter(([, c]) => c >= 2)
        .map(([key, c]) => {
            const [a, b] = key.split(SEP);
            const ca = itemCount.get(a) || 1;
            const cb = itemCount.get(b) || 1;
            return {
                a, b, count: c,
                lift: round2((c * N) / (ca * cb)),
                confAtoB: round2((c / ca) * 100),
                confBtoA: round2((c / cb) * 100),
            };
        })
        .sort((x, y) => y.count - x.count || y.lift - x.lift)
        .slice(0, 20);

    // ── Next-purchase transitions (ต่อคนไข้ ใบเสร็จที่อยู่ติดกันตามเวลา) ──
    const byHn = new Map<string, { date: string; items: Set<string> }[]>();
    allBaskets.forEach((b) => {
        const arr = byHn.get(b.hn) || [];
        arr.push({ date: b.date, items: b.items });
        byHn.set(b.hn, arr);
    });
    const transCount = new Map<string, number>();
    const transGap = new Map<string, number>();
    byHn.forEach((arr) => {
        if (arr.length < 2) return;
        arr.sort((p, q) => p.date.localeCompare(q.date));
        for (let k = 0; k < arr.length - 1; k++) {
            const prev = arr[k], next = arr[k + 1];
            const gap = Math.max(0, Math.round((new Date(next.date + "T00:00:00").getTime() - new Date(prev.date + "T00:00:00").getTime()) / 86400000));
            prev.items.forEach((A) => {
                next.items.forEach((B) => {
                    const key = A + SEP + B;
                    transCount.set(key, (transCount.get(key) || 0) + 1);
                    transGap.set(key, (transGap.get(key) || 0) + gap);
                });
            });
        }
    });
    const transitions: PurchaseTransition[] = [...transCount.entries()]
        .filter(([, c]) => c >= 2)
        .map(([key, c]) => {
            const [from, to] = key.split(SEP);
            return { from, to, count: c, avgGapDays: round2((transGap.get(key) || 0) / c) };
        })
        .sort((x, y) => y.count - x.count)
        .slice(0, 20);

    return { totalBaskets, multiItemBaskets, pairs, transitions };
}
