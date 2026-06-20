/**
 * Shared types + constants for consultation room system.
 * Separated from "use server" files (which can only export async functions).
 */

import type { ServiceCategory } from "@/lib/visit-service-types";

export type RoomColor = "slate" | "blue" | "emerald" | "amber" | "pink" | "purple" | "red";

export interface Room {
    id: string;
    room_name: string;
    room_type: string;
    service_categories: ServiceCategory[];
    description: string | null;
    display_order: number;
    color: RoomColor;
    is_active: boolean;
    assigned_doctor_ids: string[];
}

export interface AssignedDoctor {
    staff_id: string;
    name: string;
    role: string;
}

/** Shape from view `v_room_current_status` — note: uses `room_id` not `id` */
export interface RoomStatus {
    room_id: string;
    room_name: string;
    room_type: string;
    service_categories: ServiceCategory[];
    description: string | null;
    display_order: number;
    color: RoomColor;
    is_active: boolean;
    assigned_doctor_ids: string[];
    assigned_doctors: AssignedDoctor[];
    active_session_id: string | null;
    session_started_at: string | null;
    doctor_staff_id: string | null;
    doctor_profile_id: string | null;
    doctor_name: string | null;
    doctor_role: string | null;
    doctor_specialties: string[] | null;
    waiting_count: number;
}

export const ROOM_COLOR_STYLES: Record<RoomColor, { bg: string; text: string; border: string; accent: string }> = {
    slate: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300", accent: "from-slate-500 to-slate-600" },
    blue: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300", accent: "from-blue-500 to-blue-600" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300", accent: "from-emerald-500 to-emerald-600" },
    amber: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", accent: "from-amber-400 to-amber-600" },
    pink: { bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-300", accent: "from-pink-500 to-pink-600" },
    purple: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300", accent: "from-purple-500 to-purple-600" },
    red: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300", accent: "from-red-500 to-red-600" },
};

export const ROOM_TYPE_LABEL: Record<string, string> = {
    examination: "ห้องตรวจ",
    aesthetic: "ห้องความงาม",
    procedure: "ห้องหัตถการ",
    dental: "ห้องทันตกรรม",
    physiotherapy: "ห้องกายภาพ",
    other: "อื่นๆ",
};

export const ROOM_TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: "examination", label: "ห้องตรวจทั่วไป" },
    { value: "aesthetic", label: "ห้องความงาม" },
    { value: "procedure", label: "ห้องหัตถการ" },
    { value: "dental", label: "ห้องทันตกรรม" },
    { value: "physiotherapy", label: "ห้องกายภาพ" },
    { value: "other", label: "อื่นๆ" },
];

export const ROOM_COLOR_OPTIONS: { value: RoomColor; label: string; hex: string }[] = [
    { value: "slate", label: "เทา", hex: "#64748b" },
    { value: "blue", label: "ฟ้า", hex: "#3b82f6" },
    { value: "emerald", label: "เขียว", hex: "#10b981" },
    { value: "amber", label: "ส้ม-เหลือง", hex: "#f59e0b" },
    { value: "pink", label: "ชมพู", hex: "#ec4899" },
    { value: "purple", label: "ม่วง", hex: "#a855f7" },
    { value: "red", label: "แดง", hex: "#ef4444" },
];
