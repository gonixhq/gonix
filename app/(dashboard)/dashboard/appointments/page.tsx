import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { bangkokDate } from "@/lib/utils/date";
import AppointmentsClient from "./appointments-client";

type ViewMode = "week" | "month" | "day";

function startOfWeek(date: Date): Date {
    const d = new Date(date);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    d.setHours(0, 0, 0, 0);
    return d;
}

function getRange(view: ViewMode, base: Date): { start: Date; end: Date } {
    const start = new Date(base);
    const end = new Date(base);
    if (view === "week") {
        const monday = startOfWeek(base);
        start.setTime(monday.getTime());
        end.setTime(monday.getTime());
        end.setDate(monday.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    } else if (view === "month") {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        // Last day of month
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        // Extend to fill calendar grid (start from Monday of week containing day 1)
        const firstDow = start.getDay();
        const padBefore = firstDow === 0 ? 6 : firstDow - 1;
        start.setDate(start.getDate() - padBefore);
        // Extend to Sunday after last day
        const lastDow = end.getDay();
        const padAfter = lastDow === 0 ? 0 : 7 - lastDow;
        end.setDate(end.getDate() + padAfter);
    } else if (view === "day") {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    }
    return { start, end };
}

export default async function AppointmentsPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string; date?: string }>;
}) {
    await gatePermission("appointments.view");
    const params = await searchParams;
    const view = (params.view === "month" || params.view === "day" ? params.view : "week") as ViewMode;
    // วันนี้ตามเวลาไทย (กันกรณี server เป็น UTC แล้ว today เพี้ยน)
    const today = bangkokDate();
    const baseDate = params.date ? new Date(params.date + "T00:00:00") : new Date(today + "T00:00:00");
    if (isNaN(baseDate.getTime())) baseDate.setTime(new Date(today + "T00:00:00").getTime());

    const { start, end } = getRange(view, baseDate);

    const supabase = await createClient();
    const { data: appointments } = await supabase
        .from("appointments")
        .select(`
            id, appt_date, appt_start, appt_end, duration_min, appt_type, status, note,
            doctor_id, hn,
            patients!inner(hn, first_name, last_name, phone),
            doctor:staff!appointments_doctor_id_fkey(id, profiles!inner(full_name))
        `)
        .gte("appt_date", bangkokDate(start))
        .lte("appt_date", bangkokDate(end))
        .order("appt_date", { ascending: true })
        .order("appt_start", { ascending: true });

    const { data: doctors } = await supabase
        .from("staff")
        .select("id, profiles!inner(full_name)")
        .in("profiles.role", ["doctor", "owner"]);

    return (
        <AppointmentsClient
            appointments={appointments || []}
            view={view}
            baseDateISO={bangkokDate(baseDate)}
            startISO={bangkokDate(start)}
            endISO={bangkokDate(end)}
            today={today}
            doctors={doctors || []}
        />
    );
}
