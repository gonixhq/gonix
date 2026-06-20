"use server";

import { createClient } from "@/lib/supabase/server";

export interface AlertItem {
    id: string;
    type: "low_stock" | "expiry" | "expired" | "outstanding";
    title: string;
    detail: string;
    href: string;
    severity: "high" | "medium";
    expiryLevel?: ExpiryLevel;   // ระดับความเร่งด่วน (เฉพาะ type expiry)
    expiryDate?: string;          // YYYY-MM-DD (เฉพาะ type expiry/expired)
    daysLeft?: number;            // วันคงเหลือ (ลบ = หมดแล้ว)
}

/** ระดับความเร่งด่วนของวันหมดอายุ */
export type ExpiryLevel = "critical" | "urgent" | "watch";

export interface AlertSummary {
    lowStock: number;
    expiringSoon: number;   // ใกล้หมดอายุ (≤90 วัน) — รวมทุกระดับ
    expired: number;         // หมดอายุแล้ว
    outstanding: number;     // จำนวนใบเสร็จค้างชำระ
    outstandingAmount: number;
    // แยกตามระดับความเร่งด่วน
    expiryCritical: number;  // ≤7 วัน
    expiryUrgent: number;    // ≤30 วัน
    expiryWatch: number;     // ≤90 วัน
    total: number;           // รวมทุกแจ้งเตือน
    items: AlertItem[];      // รายการ (สูงสุด ~25 สำหรับ dropdown)
}

const NEAR_EXPIRY_DAYS = 90;
const URGENT_DAYS = 30;
const CRITICAL_DAYS = 7;

/** แปลงวันคงเหลือ → ระดับความเร่งด่วน */
function expiryLevelFromDays(days: number): ExpiryLevel {
    if (days <= CRITICAL_DAYS) return "critical";
    if (days <= URGENT_DAYS) return "urgent";
    return "watch";
}

function bangkokToday(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

/** รวมแจ้งเตือนทั้งระบบ — สต๊อกต่ำ + ใกล้/หมดอายุ + ค้างชำระ */
export async function getAlerts(): Promise<AlertSummary> {
    const empty: AlertSummary = {
        lowStock: 0, expiringSoon: 0, expired: 0,
        expiryCritical: 0, expiryUrgent: 0, expiryWatch: 0,
        outstanding: 0, outstandingAmount: 0, total: 0, items: [],
    };
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return empty;
        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return empty;
        const clinicId = profile.clinic_id;

        const today = bangkokToday();
        const todayDate = new Date(today + "T00:00:00");

        // ── Inventory (active + มีสต๊อก) ──
        const { data: inv } = await supabase
            .from("inventory")
            .select("id, item_name, strength, unit, stock_qty, min_stock, expiry_date")
            .eq("clinic_id", clinicId)
            .eq("is_active", true)
            .gt("stock_qty", 0);

        const items: AlertItem[] = [];
        let lowStock = 0, expiringSoon = 0, expired = 0;
        let expiryCritical = 0, expiryUrgent = 0, expiryWatch = 0;

        for (const it of inv || []) {
            const stock = Number(it.stock_qty || 0);
            const min = Number(it.min_stock || 0);

            // Low stock
            if (min > 0 && stock <= min) {
                lowStock++;
                items.push({
                    id: `low-${it.id}`,
                    type: "low_stock",
                    title: `${it.item_name}${it.strength ? ` ${it.strength}` : ""}`,
                    detail: `สต๊อกต่ำ — เหลือ ${stock} ${it.unit} (ขั้นต่ำ ${min})`,
                    href: `/dashboard/inventory/${it.id}`,
                    severity: "high",
                });
            }

            // Expiry
            if (it.expiry_date) {
                const exp = new Date(it.expiry_date + "T00:00:00");
                const days = Math.round((exp.getTime() - todayDate.getTime()) / 86400000);
                const fullDate = exp.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
                if (days < 0) {
                    expired++;
                    items.push({
                        id: `exp-${it.id}`,
                        type: "expired",
                        title: `${it.item_name}${it.strength ? ` ${it.strength}` : ""}`,
                        detail: `หมดอายุแล้ว ${Math.abs(days)} วัน · หมดเมื่อ ${fullDate}`,
                        href: `/dashboard/inventory/${it.id}`,
                        severity: "high",
                        expiryDate: it.expiry_date,
                        daysLeft: days,
                    });
                } else if (days <= NEAR_EXPIRY_DAYS) {
                    expiringSoon++;
                    const level = expiryLevelFromDays(days);
                    if (level === "critical") expiryCritical++;
                    else if (level === "urgent") expiryUrgent++;
                    else expiryWatch++;
                    items.push({
                        id: `exp-${it.id}`,
                        type: "expiry",
                        title: `${it.item_name}${it.strength ? ` ${it.strength}` : ""}`,
                        detail: `เหลือ ${days} วัน · หมดอายุ ${fullDate}`,
                        href: `/dashboard/inventory/${it.id}`,
                        severity: level === "critical" ? "high" : "medium",
                        expiryLevel: level,
                        expiryDate: it.expiry_date,
                        daysLeft: days,
                    });
                }
            }
        }

        // ── Outstanding invoices (partial / issued ที่ยังค้าง) ──
        const { data: invoices } = await supabase
            .from("invoice_headers")
            .select("id, hn, total_amount, paid_amount, invoice_date, patients!inner(prefix, first_name, last_name)")
            .eq("clinic_id", clinicId)
            .in("status", ["partial", "issued"])
            .order("invoice_date", { ascending: false })
            .limit(50);

        let outstanding = 0, outstandingAmount = 0;
        for (const ivc of invoices || []) {
            const bal = Number(ivc.total_amount || 0) - Number(ivc.paid_amount || 0);
            if (bal <= 0) continue;
            outstanding++;
            outstandingAmount += bal;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = Array.isArray((ivc as any).patients) ? (ivc as any).patients[0] : (ivc as any).patients;
            if (items.filter(i => i.type === "outstanding").length < 10) {
                items.push({
                    id: `out-${ivc.id}`,
                    type: "outstanding",
                    title: `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || ivc.hn,
                    detail: `ค้างชำระ ฿${bal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · ${ivc.id}`,
                    href: `/dashboard/finance/${ivc.id}`,
                    severity: "medium",
                });
            }
        }

        // Sort: เรียงตามความเร่งด่วน — หมดแล้ว/critical ก่อน, แล้วตามวันคงเหลือน้อยสุด
        const rank = (i: AlertItem): number => {
            if (i.type === "expired") return 0;
            if (i.type === "low_stock") return 1;
            if (i.type === "expiry") {
                if (i.expiryLevel === "critical") return 2;
                if (i.expiryLevel === "urgent") return 3;
                return 4;
            }
            return 5; // outstanding
        };
        items.sort((a, b) => {
            const r = rank(a) - rank(b);
            if (r !== 0) return r;
            // ภายในระดับเดียวกัน: วันคงเหลือน้อยกว่าขึ้นก่อน
            return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
        });

        const total = lowStock + expiringSoon + expired + outstanding;

        return {
            lowStock,
            expiringSoon,
            expired,
            expiryCritical,
            expiryUrgent,
            expiryWatch,
            outstanding,
            outstandingAmount,
            total,
            items: items.slice(0, 25),
        };
    } catch {
        return empty;
    }
}
