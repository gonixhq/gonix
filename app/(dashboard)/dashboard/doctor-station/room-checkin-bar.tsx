"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DoorOpen, DoorClosed, RefreshCw, Clock, Users, X, Lock, Stethoscope } from "lucide-react";
import { checkInRoom, checkOutRoom, type CurrentSession } from "@/lib/actions/room-sessions";
import { ROOM_COLOR_STYLES, type RoomColor, type RoomStatus } from "@/lib/room-types";

interface Props {
    currentSession: CurrentSession;
    rooms: RoomStatus[];
}

export default function RoomCheckinBar({ currentSession, rooms }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showSwitchModal, setShowSwitchModal] = useState(false);
    const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);

    const colorStyle = ROOM_COLOR_STYLES[currentSession.color as RoomColor];

    function elapsedTime(): string {
        const minutes = Math.floor((Date.now() - new Date(currentSession.checked_in_at).getTime()) / 60000);
        if (minutes < 60) return `${minutes} นาที`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours} ชม. ${mins} นาที`;
    }

    function handleSwitch(roomId: string) {
        startTransition(async () => {
            const res = await checkInRoom(roomId);
            if (!res.success) {
                alert(res.error || "เปลี่ยนห้องไม่สำเร็จ");
                return;
            }
            setShowSwitchModal(false);
            router.refresh();
        });
    }

    function handleCheckout() {
        startTransition(async () => {
            const res = await checkOutRoom();
            if (!res.success) {
                alert(res.error || "ออกจากห้องไม่สำเร็จ");
                return;
            }
            setShowCheckoutConfirm(false);
            router.refresh();
        });
    }

    const otherRooms = rooms.filter((r) => r.room_id !== currentSession.room_id);

    return (
        <>
            <div className={`gonix-card-premium px-4 py-3 flex items-center justify-between gap-3 border ${colorStyle.border}`}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-xl ${colorStyle.bg} flex items-center justify-center shrink-0`}>
                        <DoorOpen className={`h-4 w-4 ${colorStyle.text}`} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Check-in อยู่ที่</div>
                        <div className={`text-sm font-black ${colorStyle.text} truncate`}>{currentSession.room_name}</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 ml-2 shrink-0">
                        <Clock className="h-3 w-3" />
                        <span className="tabular-nums">{elapsedTime()}</span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg gap-1 h-8 text-xs"
                        onClick={() => setShowSwitchModal(true)}
                        disabled={pending}
                    >
                        <RefreshCw className="h-3.5 w-3.5" /> เปลี่ยนห้อง
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg gap-1 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => setShowCheckoutConfirm(true)}
                        disabled={pending}
                    >
                        <DoorClosed className="h-3.5 w-3.5" /> ออกจากห้อง
                    </Button>
                </div>
            </div>

            {/* Switch modal */}
            {showSwitchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">เลือกห้องตรวจที่จะย้ายไป</h3>
                            <button onClick={() => setShowSwitchModal(false)} className="rounded-lg p-1 hover:bg-slate-100">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">
                            หลังเลือกห้องใหม่ ระบบจะ check-out จากห้อง <strong>{currentSession.room_name}</strong> ให้อัตโนมัติ
                        </p>
                        {otherRooms.length === 0 ? (
                            <div className="text-center py-8 text-sm text-slate-500">ไม่มีห้องอื่นในระบบ</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {otherRooms.map((room) => {
                                    const cs = ROOM_COLOR_STYLES[room.color];
                                    const occupied = !!room.doctor_staff_id;
                                    return (
                                        <button
                                            key={room.room_id}
                                            onClick={() => !occupied && handleSwitch(room.room_id)}
                                            disabled={occupied || pending}
                                            className={`text-left p-3 rounded-xl border-2 transition-all ${occupied
                                                ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                                                : `${cs.bg} ${cs.border} hover:shadow-md`
                                                }`}
                                        >
                                            <div className="flex items-start gap-2.5">
                                                <Stethoscope className={`h-5 w-5 ${cs.text} shrink-0 mt-0.5`} strokeWidth={2.5} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-800 truncate">{room.room_name}</div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                                                        {occupied ? (
                                                            <div className="flex items-center gap-1">
                                                                <Lock className="h-3 w-3" />
                                                                <span>มี {room.doctor_name} อยู่</span>
                                                            </div>
                                                        ) : (
                                                            <div className="text-slate-400">ว่าง</div>
                                                        )}
                                                        <div className="flex items-center gap-1">
                                                            <Users className="h-3 w-3" />
                                                            <span>คิวรอ {room.waiting_count} คน</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="flex items-center justify-end pt-2">
                            <Button variant="outline" onClick={() => setShowSwitchModal(false)} disabled={pending} className="rounded-xl">
                                ยกเลิก
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Checkout confirm */}
            {showCheckoutConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-3">
                        <h3 className="text-lg font-bold text-slate-900">ออกจากห้อง?</h3>
                        <p className="text-sm text-slate-600">
                            คุณจะ check-out จากห้อง <strong>{currentSession.room_name}</strong>
                            หลังออกจะไม่เห็นคิวรอตรวจของห้องนี้ จนกว่าจะ check-in ใหม่
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setShowCheckoutConfirm(false)} disabled={pending} className="rounded-xl">
                                ยกเลิก
                            </Button>
                            <Button
                                onClick={handleCheckout}
                                disabled={pending}
                                className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                            >
                                {pending ? "กำลังออก..." : "ยืนยันออก"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
