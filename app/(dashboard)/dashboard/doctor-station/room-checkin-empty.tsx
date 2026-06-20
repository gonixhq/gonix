"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DoorOpen, UserCircle2, Users, Lock, AlertCircle, CheckCircle, Stethoscope } from "lucide-react";
import { checkInRoom } from "@/lib/actions/room-sessions";
import { ROOM_COLOR_STYLES, type RoomStatus } from "@/lib/room-types";
import { SERVICE_LABEL } from "@/lib/visit-service-types";

interface Props {
    doctorName: string;
    rolePrefix: string;
    rooms: RoomStatus[];
}

export default function RoomCheckinEmpty({ doctorName, rolePrefix, rooms }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    function handleCheckin(roomId: string, roomName: string) {
        setError(null);
        setSuccess(null);
        startTransition(async () => {
            const res = await checkInRoom(roomId);
            if (!res.success) {
                setError(res.error || "Check-in ไม่สำเร็จ");
                return;
            }
            setSuccess(`✓ เข้าห้อง "${roomName}" สำเร็จ`);
            setTimeout(() => router.refresh(), 800);
        });
    }

    return (
        <div className="space-y-5 max-w-5xl mx-auto animate-fade-in pb-12">
            {/* Header */}
            <div className="pt-2">
                <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">เลือกห้องตรวจ</h1>
                <p className="text-sm text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
                    <UserCircle2 className="h-3.5 w-3.5" />
                    <span className="font-semibold text-slate-700">{rolePrefix && <>{rolePrefix} </>}{doctorName}</span>
                    <span className="text-slate-300">·</span>
                    <span>เริ่มต้นด้วยการเข้าห้องตรวจที่จะประจำ</span>
                </p>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0" /> {success}
                </div>
            )}

            {rooms.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <DoorOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <h2 className="text-base font-bold text-slate-700">ยังไม่มีห้องตรวจในระบบ</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        ติดต่อ Admin ให้สร้างห้องตรวจที่ <span className="font-mono text-slate-700">Settings → ห้องตรวจ</span>
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {rooms.map((room) => {
                        const colorStyle = ROOM_COLOR_STYLES[room.color];
                        const isOccupied = !!room.doctor_staff_id;
                        return (
                            <div
                                key={room.room_id}
                                className={`gonix-card-premium p-4 transition-all ${isOccupied ? "opacity-60" : "hover:shadow-xl"}`}
                            >
                                <div className="flex items-start gap-3 mb-3">
                                    <div className={`h-12 w-12 rounded-xl ${colorStyle.bg} flex items-center justify-center shrink-0`}>
                                        <Stethoscope className={`h-6 w-6 ${colorStyle.text}`} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-bold text-slate-800 truncate">{room.room_name}</h3>
                                        {room.description && (
                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{room.description}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Services */}
                                {room.service_categories.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {room.service_categories.map((sc) => (
                                            <span
                                                key={sc}
                                                className={`text-[10px] px-2 py-0.5 rounded font-semibold ${colorStyle.bg} ${colorStyle.text}`}
                                            >
                                                {SERVICE_LABEL[sc] || sc}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Status row */}
                                <div className="space-y-1.5 mb-3 text-xs">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <UserCircle2 className="h-3.5 w-3.5 shrink-0" />
                                        {isOccupied ? (
                                            <>
                                                <span className="font-semibold text-amber-700">
                                                    {room.doctor_name}
                                                </span>
                                                <span className="text-[10px] px-1.5 py-0 rounded bg-amber-100 text-amber-800 font-bold">
                                                    ใช้งานอยู่
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-slate-400">ว่าง — ไม่มีหมอประจำ</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Users className="h-3.5 w-3.5 shrink-0" />
                                        <span>คิวรอตรวจ <span className="font-bold text-slate-800">{room.waiting_count}</span> คน</span>
                                    </div>
                                </div>

                                {/* Action */}
                                <Button
                                    onClick={() => handleCheckin(room.room_id, room.room_name)}
                                    disabled={isOccupied || pending}
                                    className={`w-full rounded-xl gap-1.5 ${isOccupied
                                        ? "bg-slate-200 text-slate-400"
                                        : `bg-gradient-to-r ${colorStyle.accent} text-white shadow-md`
                                        }`}
                                >
                                    {isOccupied ? (
                                        <>
                                            <Lock className="h-4 w-4" /> ห้องไม่ว่าง
                                        </>
                                    ) : (
                                        <>
                                            <DoorOpen className="h-4 w-4" /> เข้าห้องนี้
                                        </>
                                    )}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
