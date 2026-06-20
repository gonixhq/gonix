"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function seedInventory() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    const sampleDrugs = [
        {
            clinic_id: profile.clinic_id,
            item_code: "DRG-001", item_name: "Paracetamol 500mg", generic_name: "Paracetamol",
            category: "drug", dosage_form: "tablets", strength: "500 mg", unit: "Tablet",
            cost_price: 1.0, sell_price: 2.0, stock_qty: 1000, min_stock: 100, is_active: true
        },
        {
            clinic_id: profile.clinic_id,
            item_code: "DRG-002", item_name: "Amoxicillin 500mg", generic_name: "Amoxicillin",
            category: "drug", dosage_form: "capsule", strength: "500 mg", unit: "Capsule",
            cost_price: 2.5, sell_price: 5.0, stock_qty: 500, min_stock: 50, is_active: true
        },
        {
            clinic_id: profile.clinic_id,
            item_code: "DRG-003", item_name: "Cetirizine 10mg", generic_name: "Cetirizine",
            category: "drug", dosage_form: "tablets", strength: "10 mg", unit: "Tablet",
            cost_price: 1.5, sell_price: 3.0, stock_qty: 800, min_stock: 100, is_active: true
        },
        {
            clinic_id: profile.clinic_id,
            item_code: "DRG-004", item_name: "Ibuprofen 400mg", generic_name: "Ibuprofen",
            category: "drug", dosage_form: "tablets", strength: "400 mg", unit: "Tablet",
            cost_price: 2.0, sell_price: 4.0, stock_qty: 300, min_stock: 50, is_active: true
        },
        {
            clinic_id: profile.clinic_id,
            item_code: "DRG-005", item_name: "Omeprazole 20mg", generic_name: "Omeprazole",
            category: "drug", dosage_form: "capsule", strength: "20 mg", unit: "Capsule",
            cost_price: 4.0, sell_price: 8.0, stock_qty: 400, min_stock: 100, is_active: true
        },
        {
            clinic_id: profile.clinic_id,
            item_code: "SUP-001", item_name: "Normal Saline 100ml", generic_name: "Sodium Chloride 0.9%",
            category: "supply", dosage_form: "other", strength: "0.9%", unit: "Bottle",
            cost_price: 25.0, sell_price: 50.0, stock_qty: 50, min_stock: 10, is_active: true
        },
        {
            clinic_id: profile.clinic_id,
            item_code: "SUP-002", item_name: "Syringe 5ml", generic_name: "-",
            category: "supply", dosage_form: "other", strength: "-", unit: "Piece",
            cost_price: 5.0, sell_price: 15.0, stock_qty: 200, min_stock: 20, is_active: true
        }
    ];

    const { error } = await supabase.from("inventory").insert(sampleDrugs);
    if (error) {
        console.error("Seed error:", error);
        throw error;
    }

    revalidatePath("/dashboard/inventory");
}
