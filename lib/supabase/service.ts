import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypass RLS.
 * ใช้เฉพาะงาน backend ที่ไม่มี user session (cron jobs, LINE webhook)
 * ต้องตั้ง env SUPABASE_SERVICE_ROLE_KEY (อย่าเผยแพร่ฝั่ง client)
 */
export function createServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
