import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { listActiveServices } from "@/lib/actions/services";
import { getVisitInjections } from "@/lib/actions/injections";
import CheckoutForm from "./checkout-form";

export default async function PharmacyCheckoutPage({ params }: { params: Promise<{ vn: string }> }) {
    const supabase = await createClient();
    const { vn } = await params;

    const { data: visit, error: visitError } = await supabase
        .from("visits")
        .select(`
            vn,
            hn,
            status,
            visit_date,
            patients (
                first_name,
                last_name,
                prefix,
                gender,
                dob,
                phone
            )
        `)
        .eq("vn", vn)
        .single();

    if (!visit || visitError) {
        return notFound();
    }

    // Fetch prescribed drugs
    const { data: drugOrders } = await supabase
        .from("drug_orders")
        .select(`
            id,
            item_id,
            qty,
            unit,
            cost_per_unit,
            sig_text,
            inventory!inner(item_name, generic_name, strength, segment)
        `)
        .eq("vn", vn);

    // Fetch prescribed labs (if any lab_orders table exists, we'll try to fetch, if it errors, we just pass empty)
    // Looking at previous plans, there is a `lab_orders` table. 
    const { data: labOrders } = await supabase
        .from("lab_orders")
        .select(`
            id,
            lab_name,
            lab_type,
            price,
            status
        `)
        .eq("vn", vn)
        .gt("price", 0); // เฉพาะรายการที่มีราคา (lab เดี่ยว + บรรทัดแพ็ก) — เทสย่อยในแพ็ก price 0 ไม่ต้องคิดซ้ำ

    // Service catalog (preset items สำหรับเคาท์เตอร์)
    const services = await listActiveServices();

    // Active drugs + supplies from inventory (สำหรับ "เพิ่มยา/เวชภัณฑ์" picker)
    const { data: drugs } = await supabase
        .from("inventory")
        .select("id, item_name, generic_name, strength, dosage_form, unit, sell_price, stock_qty, category, segment, deduction_type")
        .in("category", ["drug", "supply"])
        .eq("is_active", true)
        .order("category")
        .order("item_name");

    // การฉีดที่หมอบันทึก → เด้งขึ้นบิลอัตโนมัติ (P06)
    const injections = await getVisitInjections(vn);

    // ออกใบเสร็จย้อนหลังได้เฉพาะ owner/admin (default-deny role อื่น)
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
    const canBackdate = prof?.role === "owner" || prof?.role === "admin";

    return (
        <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-24">
            <CheckoutForm
                visit={visit}
                drugOrders={drugOrders || []}
                labOrders={labOrders || []}
                services={services}
                inventoryDrugs={drugs || []}
                injections={injections}
                canBackdate={canBackdate}
            />
        </div>
    );
}
