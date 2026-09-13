import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import PatientsClient from "./patients-client";
import { bangkokDate } from "@/lib/utils/date";

export default async function PatientsPage({ searchParams }: {
    searchParams: Promise<{ q?: string; gender?: string; age?: string; page?: string }>;
}) {
    await gatePermission("patients.view");
    const { clinicId } = await getEffectivePermissionsForUser();
    if (!clinicId) return <div role="alert">ไม่พบข้อมูลคลินิก</div>;
    const params = await searchParams;
    const search = (params.q || "").trim().slice(0, 100);
    const gender = ["M", "F"].includes(params.gender || "") ? params.gender! : "all";
    const age = ["child", "adult", "senior"].includes(params.age || "") ? params.age! : "all";
    const page = /^\d{1,6}$/.test(params.page || "") ? Math.max(1, Number(params.page)) : 1;
    const pageSize = 25;
    const supabase = await createClient();
    let query = supabase.from("patients")
        .select("hn,prefix,first_name,last_name,phone,gender,dob,blood_group,nhso_rights,visit_count,last_visit_date,is_active,is_blocked,created_at,photo_url,allergy_summary", { count: "exact" })
        .eq("clinic_id", clinicId).eq("is_active", true);
    // แต่ละคำค้นต้องพบอย่างน้อยหนึ่งคอลัมน์ รองรับชื่อ + นามสกุล
    for (const word of search.split(/\s+/).filter(Boolean)) {
        const literal = word.replace(/[\\%_*]/g, "\\$&").replace(/"/g, '\\"');
        const pattern = `"%${literal}%"`;
        query = query.or(`hn.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`);
    }
    if (gender !== "all") query = query.eq("gender", gender);
    const today = bangkokDate();
    const cutoff = (years: number) => {
        const year = Number(today.slice(0,4)) - years;
        const month = Number(today.slice(5,7));
        const day = Math.min(Number(today.slice(8,10)), new Date(Date.UTC(year, month, 0)).getUTCDate());
        return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    };
    if (age === "child") query = query.gt("dob", cutoff(18)).lte("dob", today);
    if (age === "adult") query = query.lte("dob", cutoff(18)).gt("dob", cutoff(60));
    if (age === "senior") query = query.lte("dob", cutoff(60));
    const { data: patients, count, error } = await query.order("created_at", { ascending: false })
        .order("hn", { ascending: true }).range((page - 1) * pageSize, page * pageSize - 1);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from("profiles").select("role")
        .eq("id", user.id).eq("clinic_id", clinicId).single() : { data: null };
    return <PatientsClient key={`${search}-${gender}-${age}-${page}`} patients={patients || []} search={search}
        isOwner={profile?.role === "owner"} gender={gender} age={age} page={page} pageSize={pageSize}
        total={count || 0} loadError={!!error} />;
}
