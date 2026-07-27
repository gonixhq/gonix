// LINE Messaging API helpers (server-side)
// ต้องตั้ง env: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET
import crypto from "crypto";

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const SECRET = process.env.LINE_CHANNEL_SECRET || "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pushLine(to: string, messages: any[]): Promise<{ ok: boolean; error?: string }> {
    if (!TOKEN) return { ok: false, error: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN" };
    try {
        const r = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify({ to, messages }),
        });
        if (!r.ok) return { ok: false, error: `LINE API ${r.status}` };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "error" };
    }
}

/** ส่งข้อความตัวอักษร */
export async function pushLineText(to: string, text: string) {
    return pushLine(to, [{ type: "text", text }]);
}

/** ตรวจลายเซ็น webhook (x-line-signature) */
export function verifyLineSignature(body: string, signature: string | null): boolean {
    if (!SECRET || !signature) return false;
    const hash = crypto.createHmac("sha256", SECRET).update(body).digest("base64");
    return hash === signature;
}

export type LineVerifyResult = { ok: true; sub: string } | { ok: false; reason: "expired" | "invalid" };

/** ยืนยัน LINE ID token กับ LINE โดยตรง (ห้ามเชื่อ userId ที่ client ส่งมาเฉยๆ)
 *  ใช้ทั้ง self-report ของคนไข้ และการผูก LINE ของพนักงาน */
export async function verifyLineIdToken(idToken: string): Promise<LineVerifyResult> {
    const channelId = process.env.LINE_LOGIN_CHANNEL_ID || "";
    if (!idToken || !channelId) return { ok: false, reason: "invalid" };
    try {
        const r = await fetch("https://api.line.me/oauth2/v2.1/verify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await r.json().catch(() => null);
        if (!r.ok) {
            const desc = String(data?.error_description || data?.error || "").toLowerCase();
            return { ok: false, reason: desc.includes("expired") ? "expired" : "invalid" };
        }
        if (!data?.sub || data.aud !== channelId) return { ok: false, reason: "invalid" };
        return { ok: true, sub: data.sub as string };
    } catch {
        return { ok: false, reason: "invalid" };
    }
}
