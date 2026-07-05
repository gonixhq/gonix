"use client";

// รวมการเรียก getAlerts ของหลาย component (กระดิ่ง + เมนู) ให้ใช้ผลเดียวกัน
// ลดการยิง server action ซ้ำซ้อน (cache 60 วิ + dedupe คำขอที่ซ้อนกัน)
import { getAlerts, type AlertSummary } from "@/lib/actions/alerts";

let cache: { at: number; p: Promise<AlertSummary> } | null = null;
const TTL = 60_000;

export function getAlertsShared(): Promise<AlertSummary> {
    const now = Date.now();
    if (cache && now - cache.at < TTL) return cache.p;
    const p = getAlerts();
    cache = { at: now, p };
    // ถ้า fetch พัง อย่า cache promise ที่ reject ค้างไว้
    p.catch(() => { if (cache?.p === p) cache = null; });
    return p;
}
