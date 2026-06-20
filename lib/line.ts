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
