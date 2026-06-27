"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2, Send, Link2, Unlink, Copy, Check } from "lucide-react";
import { generateAffiliateLinkCode, unlinkAffiliateLine, notifyAffiliatePayout } from "@/lib/actions/affiliates";

export default function AffiliateLine({ affiliateId, linked, month }: { affiliateId: string; linked: boolean; month: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [code, setCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    function genCode() {
        setMsg(null);
        start(async () => {
            const r = await generateAffiliateLinkCode(affiliateId);
            if (!r.success) { setMsg(r.error || "สร้างรหัสไม่สำเร็จ"); return; }
            setCode(r.code || null);
        });
    }
    function unlink() {
        if (!confirm("ยกเลิกการผูก LINE ของเซลล์รายนี้?")) return;
        start(async () => { await unlinkAffiliateLine(affiliateId); setCode(null); router.refresh(); });
    }
    function sendNow() {
        setMsg(null);
        const payDate = prompt("กำหนดวันโอน (YYYY-MM-DD) — เว้นว่างได้:", "") || undefined;
        start(async () => {
            const r = await notifyAffiliatePayout(affiliateId, month, payDate ? { payDate } : undefined);
            setMsg(r.success ? "ส่งสรุปยอดทาง LINE แล้ว ✓" : (r.error || "ส่งไม่สำเร็จ"));
        });
    }
    function copy() {
        if (!code) return;
        navigator.clipboard.writeText(code);
        setCopied(true); setTimeout(() => setCopied(false), 1500);
    }

    return (
        <div className="gonix-card-premium p-5">
            <div className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[#06C755]" /> แจ้งยอดผ่าน LINE</div>
            {linked ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg"><Link2 className="h-3.5 w-3.5" /> ผูก LINE แล้ว</span>
                    <button onClick={sendNow} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#06C755] text-white text-sm font-bold disabled:opacity-50">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} ส่งสรุปยอดเดือนนี้
                    </button>
                    <button onClick={unlink} disabled={pending} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500"><Unlink className="h-3.5 w-3.5" /> ยกเลิกผูก</button>
                </div>
            ) : code ? (
                <div className="space-y-2">
                    <p className="text-xs text-slate-600">ให้เซลล์ <b>เพิ่มเพื่อน LINE OA ของคลินิก</b> แล้วพิมพ์รหัสนี้ส่งเข้าแชต:</p>
                    <div className="flex items-center gap-2">
                        <code className="text-lg font-black tracking-wider bg-slate-100 px-3 py-1.5 rounded-lg text-slate-800">{code}</code>
                        <button onClick={copy} className="inline-flex items-center gap-1 text-xs font-bold text-[#2B54F0]">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>
                    </div>
                    <p className="text-[11px] text-slate-400">เมื่อเซลล์ส่งรหัสนี้ ระบบจะผูกบัญชีอัตโนมัติ (รหัสใช้ได้ครั้งเดียว)</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-slate-500">ยังไม่ได้ผูก LINE — เซลล์จะได้รับสรุปยอดอัตโนมัติเมื่อคลินิกปิดยอด โดยไม่ต้อง login เข้าระบบ</p>
                    <button onClick={genCode} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#06C755] text-[#06C755] text-sm font-bold disabled:opacity-50">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} สร้างรหัสผูก LINE
                    </button>
                </div>
            )}
            {msg && <p className="text-xs mt-2 text-slate-600">{msg}</p>}
        </div>
    );
}
