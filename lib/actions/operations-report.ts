"use server";

import { createClient } from "@/lib/supabase/server";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string };
}

export interface PeakHours {
    grid: number[][];       // [weekday 0=อา..6=ส][hour 0..23] = จำนวน visit
    maxCell: number;        // ค่าสูงสุดในตาราง (สำหรับ normalize สีความเข้ม)
    byHour: number[];       // รวมต่อชั่วโมง (0..23)
    byDay: number[];        // รวมต่อวัน (0..6)
    total: number;
    busiest: { day: number; hour: number; count: number } | null;
}

/** Heatmap จำนวน visit แยกตามวันในสัปดาห์ × ชั่วโมงของวัน (ในช่วงวันที่) */
export async function getPeakHours(startDate: string, endDate: string): Promise<PeakHours> {
    const empty: PeakHours = { grid: Array.from({ length: 7 }, () => new Array(24).fill(0)), maxCell: 0, byHour: new Array(24).fill(0), byDay: new Array(7).fill(0), total: 0, busiest: null };
    try {
        const { supabase, clinicId } = await getCtx();
        const { data: visits } = await supabase
            .from("visits")
            .select("visit_date, visit_time")
            .eq("clinic_id", clinicId)
            .gte("visit_date", startDate)
            .lte("visit_date", endDate);

        const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
        const byHour = new Array(24).fill(0);
        const byDay = new Array(7).fill(0);
        let total = 0, maxCell = 0;
        let busiest: { day: number; hour: number; count: number } | null = null;

        for (const v of visits || []) {
            const date = v.visit_date as string;
            const time = (v.visit_time as string) || "";
            if (!date) continue;
            const day = new Date(date + "T00:00:00+07:00").getDay();  // 0=อา..6=ส
            const hour = parseInt(time.slice(0, 2), 10);
            if (isNaN(day) || isNaN(hour) || hour < 0 || hour > 23) continue;
            grid[day][hour]++;
            byHour[hour]++;
            byDay[day]++;
            total++;
            if (grid[day][hour] > maxCell) maxCell = grid[day][hour];
            if (!busiest || grid[day][hour] > busiest.count) busiest = { day, hour, count: grid[day][hour] };
        }
        return { grid, maxCell, byHour, byDay, total, busiest };
    } catch {
        return empty;
    }
}
