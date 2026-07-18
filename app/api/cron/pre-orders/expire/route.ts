import { NextRequest, NextResponse } from "next/server";
import { runPreOrderExpiry } from "@/lib/pre-order-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ตรวจ CRON_SECRET ก่อนทำอะไรทั้งสิ้น (เหมือน cron อื่นของ Gonix)
function authorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
    if (new URL(req.url).searchParams.get("secret") === secret) return true;
    return false;
}

export async function GET(req: NextRequest) {
    if (!authorized(req)) return new NextResponse("unauthorized", { status: 401 });
    try {
        const r = await runPreOrderExpiry();
        return NextResponse.json({ ok: true, ...r });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
    }
}
