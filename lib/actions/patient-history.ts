"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const ALLERGEN_TYPES = ["drug", "food", "environmental", "latex", "other"] as const;
const SEVERITIES = ["mild", "moderate", "severe", "life_threatening"] as const;

type AllergenType = typeof ALLERGEN_TYPES[number];
type Severity = typeof SEVERITIES[number];

async function requireAuthAndPerm() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    // Note: patient.edit is checked at page level; RLS protects clinic scope
    return { supabase, userId: user.id };
}

/* ─── Allergies ─── */
export async function addAllergy(
    hn: string,
    args: { allergen_name: string; allergen_type: AllergenType; severity: Severity; reaction?: string }
) {
    try {
        const { supabase } = await requireAuthAndPerm();

        if (!args.allergen_name?.trim()) return { success: false, error: "กรุณาระบุชื่อสาร" };
        if (!ALLERGEN_TYPES.includes(args.allergen_type)) return { success: false, error: "ประเภทไม่ถูกต้อง" };
        if (!SEVERITIES.includes(args.severity)) return { success: false, error: "ระดับไม่ถูกต้อง" };

        const { error } = await supabase.from("patient_allergies").insert({
            hn,
            allergen_name: args.allergen_name.trim(),
            allergen_type: args.allergen_type,
            severity: args.severity,
            reaction: args.reaction?.trim() || null,
            is_active: true,
        });
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

export async function removeAllergy(id: string, hn: string) {
    try {
        const { supabase } = await requireAuthAndPerm();
        // Soft delete
        const { error } = await supabase.from("patient_allergies").update({ is_active: false }).eq("id", id);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/* ─── Chronic diseases ─── */
export async function addChronicDisease(
    hn: string,
    args: { disease_name: string; is_controlled?: boolean | null }
) {
    try {
        const { supabase } = await requireAuthAndPerm();
        if (!args.disease_name?.trim()) return { success: false, error: "กรุณาระบุชื่อโรค" };

        const { error } = await supabase.from("patient_chronic_diseases").insert({
            hn,
            disease_name: args.disease_name.trim(),
            is_controlled: args.is_controlled ?? null,
        });
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

export async function removeChronicDisease(id: string, hn: string) {
    try {
        const { supabase } = await requireAuthAndPerm();
        const { error } = await supabase.from("patient_chronic_diseases").delete().eq("id", id);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}
