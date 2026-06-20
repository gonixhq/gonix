"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Room, RoomStatus, RoomColor } from "@/lib/room-types";
import type { ServiceCategory } from "@/lib/visit-service-types";

/** List all rooms (admin) */
export async function listRooms(): Promise<Room[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("rooms")
            .select("id, room_name, room_type, service_categories, description, display_order, color, is_active, assigned_doctor_ids")
            .eq("clinic_id", profile.clinic_id)
            .order("display_order", { ascending: true })
            .order("room_name", { ascending: true });

        return (data || []) as Room[];
    } catch {
        return [];
    }
}

export interface DoctorOption {
    staff_id: string;
    name: string;
    role: string;
}

/** Available doctors for assignment (doctor/dentist/physio/owner)
 *  Query จาก profiles เพราะ role อยู่ใน profiles ไม่ใช่ staff.
 *  Join staff เพื่อให้ได้ staff.id (auto-create ถ้ายังไม่มี ผ่าน fn_ensure_staff_for_profile)
 */
export async function listAvailableDoctors(): Promise<DoctorOption[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("profiles")
            .select("id, full_name, role, approval_status, is_active, staff(id)")
            .eq("clinic_id", profile.clinic_id)
            .in("role", ["doctor", "dentist", "physio", "owner"])
            .eq("approval_status", "approved");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (data || []) as any[];
        const activeRows = rows.filter((r) => r.is_active !== false);

        // Auto-ensure staff records for profiles ที่ยังไม่มี
        const profilesWithoutStaff = activeRows.filter((r) => {
            const s = Array.isArray(r.staff) ? r.staff[0] : r.staff;
            return !s?.id;
        });

        if (profilesWithoutStaff.length > 0) {
            // Bulk: call fn_ensure_staff_for_profile for each missing
            await Promise.all(
                profilesWithoutStaff.map((p) =>
                    supabase.rpc("fn_ensure_staff_for_profile", { p_profile_id: p.id })
                )
            );
            // Re-fetch to get fresh staff ids
            const { data: refetched } = await supabase
                .from("profiles")
                .select("id, full_name, role, staff(id)")
                .eq("clinic_id", profile.clinic_id)
                .in("role", ["doctor", "dentist", "physio", "owner"])
                .eq("approval_status", "approved");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fresh = (refetched || []) as any[];
            return fresh
                .map((r) => {
                    const s = Array.isArray(r.staff) ? r.staff[0] : r.staff;
                    return {
                        staff_id: s?.id || r.id,
                        name: r.full_name || "—",
                        role: r.role || "",
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
        }

        return activeRows
            .map((r) => {
                const s = Array.isArray(r.staff) ? r.staff[0] : r.staff;
                return {
                    staff_id: s?.id || r.id,
                    name: r.full_name || "—",
                    role: r.role || "",
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

/** Get current status of all active rooms (for screening / overview) */
export async function listRoomStatuses(): Promise<RoomStatus[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("v_room_current_status")
            .select("*")
            .eq("clinic_id", profile.clinic_id)
            .order("display_order", { ascending: true });

        return (data || []) as RoomStatus[];
    } catch {
        return [];
    }
}

export interface RoomInput {
    room_name: string;
    room_type: string;
    service_categories: ServiceCategory[];
    description?: string;
    display_order?: number;
    color: RoomColor;
    is_active?: boolean;
    assigned_doctor_ids?: string[];
}

export async function createRoom(input: RoomInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        if (!input.room_name?.trim()) return { success: false, error: "กรุณากรอกชื่อห้อง" };

        const { data, error } = await supabase
            .from("rooms")
            .insert({
                clinic_id: profile.clinic_id,
                room_name: input.room_name.trim(),
                room_type: input.room_type,
                service_categories: input.service_categories || [],
                description: input.description?.trim() || null,
                display_order: input.display_order ?? 0,
                color: input.color,
                is_active: input.is_active ?? true,
                assigned_doctor_ids: input.assigned_doctor_ids || [],
            })
            .select("id")
            .single();

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/settings/rooms");
        revalidatePath("/dashboard/doctor-station");
        return { success: true, id: data.id };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export async function updateRoom(roomId: string, input: Partial<RoomInput>) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = {};
        if (input.room_name !== undefined) update.room_name = input.room_name.trim();
        if (input.room_type !== undefined) update.room_type = input.room_type;
        if (input.service_categories !== undefined) update.service_categories = input.service_categories;
        if (input.description !== undefined) update.description = input.description?.trim() || null;
        if (input.display_order !== undefined) update.display_order = input.display_order;
        if (input.color !== undefined) update.color = input.color;
        if (input.is_active !== undefined) update.is_active = input.is_active;
        if (input.assigned_doctor_ids !== undefined) update.assigned_doctor_ids = input.assigned_doctor_ids;

        const { error } = await supabase
            .from("rooms")
            .update(update)
            .eq("id", roomId);

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/settings/rooms");
        revalidatePath("/dashboard/doctor-station");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export async function deleteRoom(roomId: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        // Soft delete: set inactive
        const { error } = await supabase
            .from("rooms")
            .update({ is_active: false })
            .eq("id", roomId);

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/settings/rooms");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
