"use server";

import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";

export interface BusyHour {
    hour: number;
    avg: number; // เฉลี่ยจำนวนคนไข้ต่อชั่วโมงนี้ (ของวันเดียวกันในอดีต)
}

export interface BusyForecast {
    weeks: number; // จำนวนวัน (เดียวกัน) ในอดีตที่นำมาเฉลี่ย
    hours: BusyHour[]; // เรียงตามชั่วโมง (เฉพาะ 8–20)
    peakHours: number[]; // ชั่วโมงที่มักแน่นสุด (สูงสุด 2 ช่วง)
}

/**
 * พยากรณ์ช่วงคิวแน่นของ "วันนี้" จากค่าเฉลี่ย 4 สัปดาห์ย้อนหลัง (วันเดียวกันของสัปดาห์)
 * heuristic ล้วน — ไม่มี ML, อ่านอย่างเดียว
 */
export async function getBusyForecast(): Promise<BusyForecast> {
    const empty: BusyForecast = { weeks: 0, hours: [], peakHours: [] };
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return empty;
        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return empty;

        const today = bangkokDate();
        const todayDow = new Date(today + "T00:00:00").getDay();
        const start = new Date(today + "T00:00:00");
        start.setDate(start.getDate() - 28);
        const startStr = start.toISOString().slice(0, 10);

        const { data } = await supabase
            .from("visits")
            .select("visit_date, visit_time")
            .eq("clinic_id", profile.clinic_id)
            .gte("visit_date", startStr)
            .lt("visit_date", today);

        // นับต่อ (วันที่ , ชั่วโมง) เฉพาะวันที่ตรง weekday เดียวกับวันนี้
        const matchingDates = new Set<string>();
        const totalByHour = new Map<number, number>();
        for (const r of data || []) {
            const d = (r as { visit_date: string }).visit_date;
            if (!d) continue;
            const dow = new Date(d + "T00:00:00").getDay();
            if (dow !== todayDow) continue;
            matchingDates.add(d);
            const t = String((r as { visit_time: string | null }).visit_time || "");
            const hh = parseInt(t.slice(0, 2), 10);
            if (isNaN(hh)) continue;
            totalByHour.set(hh, (totalByHour.get(hh) || 0) + 1);
        }

        const weeks = matchingDates.size;
        if (weeks === 0) return empty;

        const hours: BusyHour[] = [];
        for (let h = 8; h <= 20; h++) {
            hours.push({ hour: h, avg: Math.round(((totalByHour.get(h) || 0) / weeks) * 10) / 10 });
        }
        const sorted = [...hours].filter((h) => h.avg > 0).sort((a, b) => b.avg - a.avg);
        const peakHours = sorted.slice(0, 2).map((h) => h.hour).sort((a, b) => a - b);

        return { weeks, hours, peakHours };
    } catch {
        return empty;
    }
}
