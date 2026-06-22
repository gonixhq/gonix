/**
 * EOD System Lock — เมื่อปิดยอดของวันใดแล้ว ห้ามแก้ไข/ยกเลิก/รับเงินบิลของวันนั้น
 * จนกว่าจะกด "ยกเลิกการปิดยอด" (reopen) ที่หน้าปิดยอด
 */
export const DAY_LOCKED_MSG =
    'วันนั้นปิดยอดแล้ว — แก้ไข/ยกเลิก/รับเงินบิลไม่ได้ ต้องกด "ยกเลิกการปิดยอด" ที่หน้าปิดยอดก่อน';

/** true = วันนั้นถูกปิดยอดแล้ว (ล็อก) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isDayClosed(supabase: any, clinicId: string, date: string | null | undefined): Promise<boolean> {
    if (!clinicId || !date) return false;
    const { data } = await supabase
        .from("clinic_day_closes").select("id")
        .eq("clinic_id", clinicId).eq("close_date", date).maybeSingle();
    return !!data;
}
