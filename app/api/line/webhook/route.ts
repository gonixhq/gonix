import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, pushLineText } from "@/lib/line";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ผูก LINE ของเซลล์ด้วยรหัส AFF-xxxx ที่เซลล์ส่งเข้า OA
 *  ใช้ RPC link_affiliate_line (SECURITY DEFINER) เพราะ webhook เป็น anon — ผ่าน RLS ตรงๆ ไม่ได้ */
async function tryLinkAffiliate(text: string, userId: string): Promise<boolean> {
    const code = text.trim().toUpperCase();
    if (!/^AFF-[A-Z0-9]{4,8}$/.test(code)) return false;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("link_affiliate_line", { p_code: code, p_uid: userId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    if (error || !r?.ok) {
        await pushLineText(userId, "❌ รหัสผูกไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จากคลินิก");
        return true;
    }
    await pushLineText(userId, `✅ ผูกบัญชีสำเร็จ\nคุณ ${r.name} จะได้รับแจ้งเตือนสรุปยอดค่าคอมทุกครั้งที่คลินิกปิดยอด 🎉`);
    return true;
}

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
        // ข้อความตัวอักษร → ลองผูกบัญชีเซลล์ด้วยรหัส AFF-xxxx
        if (ev.type === "message" && ev.message?.type === "text" && ev.source?.userId) {
            await tryLinkAffiliate(ev.message.text || "", ev.source.userId);
            continue;
        }
        // เพิ่มเพื่อน → ทักทาย + ลิงก์ผูกบัญชี
        if (ev.type === "follow" && ev.source?.userId) {
            await pushLineText(
                ev.source.userId,
                `ยินดีต้อนรับ 🌿\nผูกบัญชีเพื่อรับแจ้งเตือนนัดหมาย/ผลตรวจ และดูข้อมูลของคุณ:\nhttps://liff.line.me/${liffId}\n\n(เซลล์ฟรีแลนซ์: พิมพ์รหัสผูก AFF-xxxx ที่ได้รับจากคลินิกเพื่อรับแจ้งยอด)`
            );
        }
    }
    return NextResponse.json({ ok: true });
}
