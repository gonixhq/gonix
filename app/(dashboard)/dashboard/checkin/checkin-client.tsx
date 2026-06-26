"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, LogIn, LogOut, Loader2, CheckCircle2, AlertTriangle, Crosshair, Settings } from "lucide-react";
import { clockIn, clockOut, setClinicLocation, type MyTimeStatus, type ClinicLocation } from "@/lib/actions/compensation";

const EARTH_M = 6371000;
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return EARTH_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CheckinClient({
    status, location, canConfig,
}: {
    status: MyTimeStatus;
    location: ClinicLocation;
    canConfig: boolean;
}) {
    const router = useRouter();
    const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
    const [geoErr, setGeoErr] = useState<string | null>(null);
    const [locating, setLocating] = useState(true);
    const [pending, start] = useTransition();
    const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
    const [radius, setRadius] = useState(location.radius);

    const locate = useCallback(() => {
        setLocating(true);
        setGeoErr(null);
        if (!navigator.geolocation) { setGeoErr("เบราว์เซอร์ไม่รองรับ GPS"); setLocating(false); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }); setLocating(false); },
            (err) => { setGeoErr(err.code === 1 ? "ไม่ได้อนุญาตสิทธิ์ตำแหน่ง — โปรดเปิด GPS/Location" : "หาตำแหน่งไม่ได้"); setLocating(false); },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
    }, []);

    useEffect(() => { locate(); }, [locate]);

    const hasClinicLoc = location.lat != null && location.lng != null;
    const dist = coords && hasClinicLoc ? distanceM(coords.lat, coords.lng, location.lat!, location.lng!) : null;
    const inRange = dist == null || dist <= location.radius;

    function doClock(kind: "in" | "out") {
        setMsg(null);
        start(async () => {
            const c = coords ? { lat: coords.lat, lng: coords.lng } : undefined;
            const res = kind === "in" ? await clockIn(c) : await clockOut(c);
            if (res?.success) { setMsg({ type: "ok", text: kind === "in" ? "เข้างานสำเร็จ ✓" : "เลิกงานสำเร็จ ✓" }); router.refresh(); }
            else setMsg({ type: "err", text: res?.error || "ทำรายการไม่สำเร็จ" });
        });
    }

    function saveLocation() {
        if (!coords) return;
        setMsg(null);
        start(async () => {
            const res = await setClinicLocation(coords.lat, coords.lng, radius);
            if (res.success) { setMsg({ type: "ok", text: "บันทึกพิกัดคลินิกแล้ว ✓" }); router.refresh(); }
            else setMsg({ type: "err", text: res.error || "บันทึกไม่สำเร็จ" });
        });
    }

    const isOpen = !!status.open;

    return (
        <div className="max-w-md mx-auto space-y-5 animate-fade-in">
            <div className="text-center pt-2">
                <h1 className="text-2xl font-black text-slate-800">ตอกบัตร GPS</h1>
                <p className="text-sm text-slate-500 mt-1">เข้า/เลิกงาน ต้องอยู่ในระยะคลินิก</p>
            </div>

            {!status.hasStaff && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                    บัญชีนี้ยังไม่ผูกกับข้อมูลพนักงาน — ตอกบัตรไม่ได้
                </div>
            )}

            {/* GPS status */}
            <div className="gonix-card-premium p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><MapPin className="h-4 w-4 text-[#2B54F0]" /> ตำแหน่งของคุณ</div>
                    <button onClick={locate} className="text-xs font-semibold text-[#2B54F0] inline-flex items-center gap-1"><Crosshair className="h-3.5 w-3.5" /> หาใหม่</button>
                </div>
                {locating ? (
                    <div className="py-4 text-center text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" /> กำลังหาตำแหน่ง...</div>
                ) : geoErr ? (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {geoErr}
                    </div>
                ) : coords ? (
                    <div className="space-y-2">
                        <div className="text-xs text-slate-500 font-mono">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} · ±{Math.round(coords.acc)}ม.</div>
                        {hasClinicLoc ? (
                            <div className={`rounded-xl p-3 text-sm font-bold flex items-center gap-2 ${inRange ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                                {inRange ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                                {inRange ? `อยู่ในระยะ (ห่าง ${Math.round(dist!)} ม.)` : `อยู่นอกระยะ (ห่าง ${Math.round(dist!)} ม. · อนุญาต ${location.radius} ม.)`}
                            </div>
                        ) : (
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500">คลินิกยังไม่ตั้งพิกัด — ตอกบัตรได้ทุกที่ {canConfig && "(ตั้งพิกัดด้านล่าง)"}</div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Current status + actions */}
            <div className="gonix-card-premium p-5">
                <div className="text-center mb-4">
                    {isOpen ? (
                        <>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">● กำลังทำงาน</div>
                            <div className="text-xs text-slate-400 mt-2">เข้างานเมื่อ {status.open ? new Date(status.open.clock_in).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
                        </>
                    ) : (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">○ ยังไม่เข้างาน</div>
                    )}
                </div>

                {msg && (
                    <div className={`rounded-xl p-3 text-sm mb-3 ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>{msg.text}</div>
                )}

                {status.hasStaff && (
                    isOpen ? (
                        <button onClick={() => doClock("out")} disabled={pending}
                            className="w-full h-14 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black text-lg shadow-lg disabled:opacity-50 inline-flex items-center justify-center gap-2">
                            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />} เลิกงาน
                        </button>
                    ) : (
                        <button onClick={() => doClock("in")} disabled={pending || (hasClinicLoc && !inRange)}
                            className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#2B54F0] to-[#00A6C0] text-white font-black text-lg shadow-lg disabled:opacity-50 inline-flex items-center justify-center gap-2">
                            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />} เข้างาน
                        </button>
                    )
                )}
            </div>

            {/* Manager: set clinic location */}
            {canConfig && coords && (
                <div className="gonix-card-premium p-5">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3"><Settings className="h-4 w-4 text-violet-600" /> ตั้งพิกัดคลินิก (ผู้จัดการ)</div>
                    <p className="text-xs text-slate-500 mb-3">{hasClinicLoc ? "ตั้งไว้แล้ว — กดอีกครั้งเพื่อใช้ตำแหน่งปัจจุบันแทน" : "ยังไม่ได้ตั้ง — ยืนที่คลินิกแล้วกดบันทึก"}</p>
                    <div className="flex items-center gap-2 mb-3">
                        <label className="text-xs text-slate-600">รัศมีอนุญาต (ม.)</label>
                        <input type="number" min={20} value={radius} onChange={(e) => setRadius(Number(e.target.value))}
                            className="w-24 h-9 rounded-lg border border-slate-200 px-2 text-sm text-center" />
                    </div>
                    <button onClick={saveLocation} disabled={pending}
                        className="w-full h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        <Crosshair className="h-4 w-4" /> ใช้ตำแหน่งนี้เป็นพิกัดคลินิก
                    </button>
                </div>
            )}

            <p className="text-center text-[11px] text-slate-400">เปิดผ่าน LINE OA ได้ — ใส่ลิงก์หน้านี้ใน Rich Menu</p>
        </div>
    );
}
