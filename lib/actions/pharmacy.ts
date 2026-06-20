"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Update visit status after pharmacy dispensing is confirmed.
 */
export async function completeDispensing(vn: string) {
    const supabase = await createClient();

    const { data: visit, error: fetchError } = await supabase
        .from("visits")
        .select("id, status")
        .eq("vn", vn)
        .single();

    if (fetchError || !visit) {
        return { error: fetchError?.message || "Visit not found" };
    }

    if (visit.status !== "waiting_medicine") {
        return { error: "Visit is not in waiting_medicine state" };
    }

    // Update to waiting_payment
    const { error: updateError } = await supabase
        .from("visits")
        .update({ status: "waiting_payment" })
        .eq("vn", vn);

    if (updateError) {
        return { error: updateError.message };
    }

    revalidatePath("/dashboard/pharmacy");
    revalidatePath("/dashboard/finance");
    return { success: true };
}
