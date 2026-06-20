"use server";

import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";

export async function getDashboardStats() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const today = bangkokDate();

    const [patientsRes, todayVisitsRes, queueRes, revenueRes, profileRes] = await Promise.all([
        supabase.from("patients").select("hn", { count: "exact", head: true }),
        supabase.from("visits").select("vn", { count: "exact", head: true }).eq("visit_date", today),
        supabase.from("queue_entries").select("id", { count: "exact", head: true }).eq("queue_date", today).not("status", "in", "(done,cancelled)"),
        supabase.from("invoice_headers").select("total_amount").gte("invoice_date", today.slice(0, 7) + "-01"),
        supabase.from("profiles").select("full_name, role, clinic_id").eq("id", user.id).single(),
    ]);

    const monthlyRevenue = (revenueRes.data || []).reduce((sum: number, inv: { total_amount: number }) => sum + (inv.total_amount || 0), 0);

    return {
        totalPatients: patientsRes.count || 0,
        todayVisits: todayVisitsRes.count || 0,
        activeQueue: queueRes.count || 0,
        monthlyRevenue,
        profile: profileRes.data,
    };
}

export async function getRecentVisits(limit = 10) {
    const supabase = await createClient();
    const today = bangkokDate();

    const { data } = await supabase
        .from("visits")
        .select(`
      vn, visit_date, visit_time, status, chief_complaint,
      patients!inner(hn, first_name, last_name, phone)
    `)
        .eq("visit_date", today)
        .order("created_at", { ascending: false })
        .limit(limit);

    return data || [];
}
