"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * RealtimeRefresh — subscribe การเปลี่ยนแปลง visits/appointments/room sessions ของคลินิก
 * แล้ว refresh แบบ debounce (event-driven real-time — ต้องรัน mig 066)
 */
export function RealtimeRefresh({ clinicId }: { clinicId: string }) {
    const router = useRouter();
    const [live, setLive] = useState(false);

    useEffect(() => {
        if (!clinicId) return;
        const supabase = createClient();
        let timer: ReturnType<typeof setTimeout> | undefined;
        // debounce ยาวขึ้น (รวม event ที่มาถี่ๆ ให้ refresh ครั้งเดียว — ลดโหลด DB)
        const bump = () => {
            clearTimeout(timer);
            timer = setTimeout(() => router.refresh(), 3000);
        };
        const filter = `clinic_id=eq.${clinicId}`;
        const channel = supabase
            .channel("overview-rt")
            .on("postgres_changes", { event: "*", schema: "public", table: "visits", filter }, bump)
            .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter }, bump)
            .on("postgres_changes", { event: "*", schema: "public", table: "room_doctor_sessions", filter }, bump)
            .subscribe((status) => setLive(status === "SUBSCRIBED"));
        return () => {
            clearTimeout(timer);
            supabase.removeChannel(channel);
        };
    }, [clinicId, router]);

    if (!live) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500 font-semibold">
            <Wifi className="h-3 w-3" /> เชื่อมต่อสด
        </span>
    );
}

/**
 * Auto-refresh — รีเฟรช server component ทุก N วินาที (ได้ฟีล real-time โดยไม่ต้องลง websocket)
 * หยุดทำงานเมื่อแท็บไม่ active เพื่อประหยัด
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
    const router = useRouter();
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState === "visible") {
                router.refresh();
                setTick((t) => t + 1);
            }
        }, seconds * 1000);
        return () => clearInterval(id);
    }, [router, seconds]);

    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400" suppressHydrationWarning>
            <RefreshCw className="h-3 w-3" />
            อัปเดตอัตโนมัติทุก {seconds} วิ
            {tick > 0 && <span className="text-emerald-500">•</span>}
        </span>
    );
}

/**
 * WaitBadge — แสดงเวลารอแบบ live (เดินเองทุก 30 วิ) จาก timestamp เริ่มต้น
 * แดงเมื่อรอเกิน thresholdMin นาที
 */
export function WaitBadge({ since, thresholdMin = 15 }: { since: string | null; thresholdMin?: number }) {
    const [mins, setMins] = useState<number | null>(null);

    useEffect(() => {
        if (!since) {
            setMins(null);
            return;
        }
        const compute = () => {
            const start = new Date(since).getTime();
            if (isNaN(start)) {
                setMins(null);
                return;
            }
            setMins(Math.max(0, Math.floor((Date.now() - start) / 60000)));
        };
        compute();
        const id = setInterval(compute, 30000);
        return () => clearInterval(id);
    }, [since]);

    if (mins === null) return null;

    const over = mins >= thresholdMin;
    const label = mins >= 60 ? `${Math.floor(mins / 60)} ชม. ${mins % 60} น.` : `${mins} น.`;

    return (
        <span
            suppressHydrationWarning
            className={`text-[11px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                over ? "bg-red-100 text-red-700 ring-1 ring-red-300 animate-pulse" : "bg-slate-100 text-slate-500"
            }`}
            title={over ? `รอเกิน ${thresholdMin} นาที` : "เวลารอ"}
        >
            ⏱ {label}
        </span>
    );
}
