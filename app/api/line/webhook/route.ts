import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, pushLineText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook ของ LINE Messaging API (ตั้ง URL นี้ใน LINE Developers Console)
export async function POST(req: NextRequest) {
    const body = await req.text();
    if (!verifyLineSignature(body, req.headers.get("x-line-signature"))) {
        return new NextResponse("invalid signature", { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    try { payload = JSON.parse(body); } catch { return NextResponse.json({ ok: true }); }

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "";
    for (const ev of payload.events || []) {
        // เพิ่มเพื่อน → ทักทาย + ลิงก์ผูกบัญชี
        if (ev.type === "follow" && ev.source?.userId) {
            await pushLineText(
                ev.source.userId,
                `ยินดีต้อนรับ 🌿\nผูกบัญชีเพื่อรับแจ้งเตือนนัดหมาย/ผลตรวจ และดูข้อมูลของคุณ:\nhttps://liff.line.me/${liffId}`
            );
        }
    }
    return NextResponse.json({ ok: true });
}
