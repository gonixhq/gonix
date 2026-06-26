"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";

export interface Announcement {
    id: string;
    message: string;
    level: "info" | "warning" | "urgent";
    created_at: string;
    expires_at: string | null;
    created_by_name: string | null;
}

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase
        .from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string, userId: user.id };
}

/** ดึงประกาศที่ยัง active + ยังไม่หมดอายุ (เรียงใหม่สุดก่อน) */
export async function getActiveAnnouncements(): Promise<Announcement[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const today = bangkokDate();
        const { data } = await supabase
            .from("announcements")
            .select("id, message, level, created_at, expires_at, profiles!announcements_created_by_fkey(full_name)")
            .eq("clinic_id", clinicId)
            .eq("is_active", true)
            .or(`expires_at.is.null,expires_at.gte.${today}`)
            .order("created_at", { ascending: false })
            .limit(10);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data || []).map((a: any) => ({
            id: a.id,
            message: a.message,
            level: a.level,
            created_at: a.created_at,
            expires_at: a.expires_at,
            created_by_name: a.profiles?.full_name ?? null,
        }));
    } catch {
        return [];
    }
}

/** โพสต์ประกาศใหม่ — เฉพาะผู้มีสิทธิ์ staff.manage */
export async function createAnnouncement(input: {
    message: string;
    level?: "info" | "warning" | "urgent";
    expires_at?: string | null;
}) {
    try {
        const { supabase, clinicId, userId } = await ctx();
        const { permissions } = await getEffectivePermissionsForUser();
        if (permissions["staff.manage"] !== true) {
            return { ok: false, error: "ไม่มีสิทธิ์โพสต์ประกาศ" };
        }
        const msg = input.message.trim();
        if (!msg) return { ok: false, error: "กรุณากรอกข้อความ" };

        const { error } = await supabase.from("announcements").insert({
            clinic_id: clinicId,
            message: msg,
            level: input.level || "info",
            expires_at: input.expires_at || null,
            created_by: userId,
        });
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/overview");
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ปลดประกาศ (soft — set is_active=false) — เฉพาะ staff.manage */
export async function dismissAnnouncement(id: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { permissions } = await getEffectivePermissionsForUser();
        if (permissions["staff.manage"] !== true) {
            return { ok: false, error: "ไม่มีสิทธิ์" };
        }
        const { error } = await supabase
            .from("announcements")
            .update({ is_active: false })
            .eq("id", id)
            .eq("clinic_id", clinicId);
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/overview");
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}
