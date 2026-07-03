import { NextRequest, NextResponse } from "next/server";
import { runFollowUpReminders } from "@/lib/follow-up-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;                 // Vercel Cron
    if (new URL(req.url).searchParams.get("secret") === secret) return true;  // external scheduler
    return false;
}

export async function GET(req: NextRequest) {
    if (!authorized(req)) return new NextResponse("unauthorized", { status: 401 });
    try {
        const r = await runFollowUpReminders();
        return NextResponse.json({ ok: true, ...r });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
    }
}
