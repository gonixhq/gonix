// ค่าคงที่ + types ของ M15 CAC (แยกจาก "use server" file)

export const AD_CHANNELS = ["facebook", "google", "tiktok", "other"] as const;
export type AdChannel = typeof AD_CHANNELS[number];

export const CHANNEL_LABEL: Record<string, string> = {
    facebook: "Facebook Ads", google: "Google Ads", tiktok: "TikTok Ads",
    other: "โฆษณาอื่นๆ", affiliate: "เซลล์ฟรีแลนซ์ (Affiliate)",
};

export interface AdSpendRow {
    channel: string;
    amount: number;
    new_customers: number;
    note: string | null;
}

export interface CacRow {
    channel: string;          // facebook | google | tiktok | other | affiliate
    label: string;
    spend: number;            // ต้นทุน (ค่าโฆษณา หรือ ค่าคอมที่จ่ายเซลล์)
    new_customers: number;
    cac: number | null;       // spend / new_customers (null ถ้าไม่มีลูกค้าใหม่)
    is_auto: boolean;         // แถวเซลล์คำนวณอัตโนมัติ
}
