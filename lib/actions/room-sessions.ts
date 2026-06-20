"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface CurrentSession {
    session_id: string;
    room_id: string;
    room_name: string;
    color: string;
    checked_in_at: string;
    doctor_staff_id: string;
}

/** Get current doctor's active room session (null = ยังไม่ check-in) */
export async function getMyCurrentRoom(): Promise<CurrentSession | null> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: staff } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();
        if (!staff?.id) return null;

        const { data } = await supabase
            .from("room_doctor_sessions")
            .select("id, room_id, checked_in_at, doctor_staff_id, rooms!inner(room_name, color)")
            .eq("doctor_staff_id", staff.id)
            .is("checked_out_at", null)
            .maybeSingle();

        if (!data) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dataAny = data as any;
        const room = Array.isArray(dataAny.rooms) ? dataAny.rooms[0] : dataAny.rooms;

        return {
            session_id: dataAny.id,
            room_id: dataAny.room_id,
            room_name: room?.room_name || "—",
            color: room?.color || "slate",
            checked_in_at: dataAny.checked_in_at,
            doctor_staff_id: dataAny.doctor_staff_id,
        };
    } catch {
        return null;
    }
}

/** Doctor check-in to a room */
export async function checkInRoom(roomId: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const { data: staff } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();
        if (!staff?.id) return { success: false, error: "ไม่พบข้อมูล Staff สำหรับ user นี้" };

        const { data: sessionId, error } = await supabase.rpc("fn_room_checkin", {
            p_clinic_id: profile.clinic_id,
            p_room_id: roomId,
            p_doctor_staff_id: staff.id,
        });

        if (error) {
            if (error.message?.includes("ROOM_OCCUPIED")) {
                return { success: false, error: "ห้องนี้มีหมอท่านอื่นใช้งานอยู่ — กรุณาเลือกห้องอื่น" };
            }
            return { success: false, error: error.message };
        }

        revalidatePath("/dashboard/doctor-station");
        return { success: true, sessionId };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Doctor check-out from current room */
export async function checkOutRoom() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: staff } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();
        if (!staff?.id) return { success: false, error: "ไม่พบข้อมูล Staff" };

        const { error } = await supabase.rpc("fn_room_checkout", {
            p_doctor_staff_id: staff.id,
        });

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/doctor-station");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
