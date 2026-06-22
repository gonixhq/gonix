import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { getEODSummary } from "@/lib/actions/end-of-day";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
    const { date } = await params;
    return { title: `ปิดยอด-${date}` };
}

const money = (n: number) => `฿${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function dateThai(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}
function dateTimeThai(d: string): string {
    return new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export default async function EODSlipPage({ params }: { params: Promise<{ date: string }> }) {
    await gatePermission("finance.eod");
    const { date } = await params;
    const summary = await getEODSummary(date);
    if ("error" in summary) return <div className="p-10 text-center text-slate-500">โหลดข้อมูลไม่สำเร็จ: {summary.error}</div>;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let clinicName = "คลินิก", branchName = "";
    if (user) {
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (profile?.clinic_id) {
            const [{ data: c }, { data: b }] = await Promise.all([
                supabase.from("tenants").select("clinic_name").eq("id", profile.clinic_id).maybeSingle(),
                supabase.from("branches").select("branch_name").eq("clinic_id", profile.clinic_id).eq("is_active", true).order("sort_order").limit(1).maybeSingle(),
            ]);
            clinicName = (c?.clinic_name as string) || clinicName;
            branchName = (b?.branch_name as string) || "";
        }
    }

    const rec = summary.closed_recon;
    const expected = rec ? rec.expected_cash : (summary.last_starting_float + summary.cash_received - summary.petty_total);
    const startFloat = rec ? rec.starting_float : summary.last_starting_float;
    const actual = rec ? rec.actual_cash : null;
    const overShort = rec ? rec.over_short : null;
    const printedAt = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

    const Row = ({ l, v, bold, neg }: { l: string; v: string; bold?: boolean; neg?: boolean }) => (
        <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
            <span>{l}</span><span className={`tabular-nums ${neg ? "text-black" : ""}`}>{v}</span>
        </div>
    );

    return (
        <>
            <div className="no-print mx-auto" style={{ maxWidth: "80mm" }}><PrintTrigger /></div>

            <div className="slip" style={{ fontFamily: "'Noto Sans Thai', monospace", color: "#000" }}>
                <div className="text-center">
                    <div className="text-[15px] font-black">{clinicName}</div>
                    {branchName && <div className="text-[11px]">{branchName}</div>}
                    <div className="text-[13px] font-bold mt-1">ใบสรุปปิดยอดประจำวัน</div>
                    <div className="text-[10px]">End of Day Report</div>
                </div>

                <div className="border-t border-dashed border-black my-2" />
                <div className="text-[12px] space-y-0.5">
                    <Row l="วันที่" v={dateThai(summary.close_date)} />
                    <Row l="สถานะ" v={summary.already_closed ? "ปิดยอดแล้ว" : "ยังไม่ปิด (ตัวอย่าง)"} />
                    {summary.closed_record && <Row l="ปิดโดย" v={summary.closed_record.closed_by_name || "—"} />}
                    {summary.closed_record?.closed_at && <Row l="เวลาปิด" v={dateTimeThai(summary.closed_record.closed_at)} />}
                </div>

                <div className="border-t border-dashed border-black my-2" />
                <div className="text-[12px] space-y-0.5">
                    <Row l={`Visit (เสร็จ ${summary.visits_by_status.completed || 0}/ยกเลิก ${summary.visits_by_status.cancelled || 0})`} v={`${summary.total_visits}`} />
                    {summary.anon_count > 0 && <Row l="เคสนิรนาม" v={`${summary.anon_count} · ${money(summary.anon_revenue)}`} />}
                    <Row l="รายได้รวม" v={money(summary.total_revenue)} bold />
                </div>

                <div className="border-t border-dashed border-black my-2" />
                <div className="text-[12px] font-bold mb-1">■ เงินสด (Cash)</div>
                <div className="text-[12px] space-y-0.5">
                    <Row l="เงินทอนตั้งต้น" v={money(startFloat)} />
                    <Row l="+ รับเงินสด" v={money(summary.cash_received)} />
                    <Row l="− รายจ่ายย่อย" v={money(summary.petty_total)} />
                    <Row l="เงินที่ควรมี" v={money(expected)} bold />
                    <Row l="เงินนับจริง" v={actual != null ? money(actual) : "—"} />
                    {overShort != null && <Row l={overShort >= 0 ? "เงินเกิน" : "เงินขาด"} v={`${overShort > 0 ? "+" : ""}${money(overShort)}`} bold />}
                </div>
                {rec?.recon_note && <div className="text-[11px] mt-1">หมายเหตุ: {rec.recon_note}</div>}

                <div className="border-t border-dashed border-black my-2" />
                <div className="text-[12px] space-y-0.5">
                    <Row l="เงินโอน (K Shop)" v={`${money(summary.transfer_total)} (${summary.transfer_count})`} />
                    <Row l="บัตรเครดิต" v={`${money(summary.credit_total)} (${summary.credit_count})`} />
                </div>

                <div className="border-t border-dashed border-black my-3" />
                <div className="text-[12px] mt-6">
                    <div className="text-center">ลงชื่อ ............................................</div>
                    <div className="text-center text-[11px] mt-1">( ผู้ปิดยอด )</div>
                </div>
                <div className="text-center text-[9px] text-slate-500 mt-3">พิมพ์เมื่อ {printedAt}</div>
            </div>

            <style>{`
                .slip { width: 76mm; box-sizing: border-box; background: white; margin: 0 auto; padding: 4mm; }
                @media print {
                    .no-print { display: none !important; }
                    @page { size: 80mm auto; margin: 0; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .slip { margin: 0; }
                }
                @media screen {
                    body { background: #f1f5f9; }
                    .slip { box-shadow: 0 4px 20px rgba(0,0,0,0.12); margin: 24px auto; }
                }
            `}</style>
        </>
    );
}
