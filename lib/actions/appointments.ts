"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createAppointment(data: {
    hn: string;
    appt_date: string;
    appt_start: string;
    appt_end: string;
    duration_min: number;
    appt_type: string;
    note?: string;
    doctor_id?: string;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    const { error } = await supabase.from("appointments").insert({
        clinic_id: profile.clinic_id,
        hn: data.hn,
        appt_date: data.appt_date,
        appt_start: data.appt_start,
        appt_end: data.appt_end,
        duration_min: data.duration_min,
        appt_type: data.appt_type,
        note: data.note || null,
        doctor_id: data.doctor_id || null,
        status: "confirmed",
        booked_via: "staff",
        created_by: user.id,
    });

    if (error) throw error;

    revalidatePath("/dashboard/appointments");
    return { success: true };
}

export async function updateAppointment(id: string, data: {
    appt_date: string;
    appt_start: string;   // "HH:MM"
    duration_min: number;
    appt_type: string;
    doctor_id?: string | null;
    note?: string | null;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const [h, m] = data.appt_start.split(":").map(Number);
    const total = h * 60 + m + data.duration_min;
    const endHM = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

    const { error } = await supabase.from("appointments").update({
        appt_date: data.appt_date,
        appt_start: data.appt_start + ":00+07",
        appt_end: endHM + ":00+07",
        duration_min: data.duration_min,
        appt_type: data.appt_type,
        doctor_id: data.doctor_id || null,
        note: data.note || null,
    }).eq("id", id);

    if (error) throw error;
    revalidatePath("/dashboard/appointments");
    return { success: true };
}

export async function updateAppointmentStatus(id: string, status: string, cancel_reason?: string) {
    const supabase = await createClient();

    const updates: Record<string, unknown> = { status };
    if (status === "cancelled") {
        updates.cancelled_at = new Date().toISOString();
        updates.cancel_reason = cancel_reason || null;
    }

    const { error } = await supabase.from("appointments").update(updates).eq("id", id);
    if (error) throw error;

    revalidatePath("/dashboard/appointments");
    return { success: true };
}
