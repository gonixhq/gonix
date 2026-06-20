"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { cancelVisit } from "@/lib/actions/visits";

interface Props {
    vn: string;
    patientName: string;
}

export default function CancelVisitButton({ vn, patientName }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    function openModal(e: MouseEvent<HTMLButtonElement>) {
        e.preventDefault();
        e.stopPropagation();
        setError(null);
        setReason("");
        setShowConfirm(true);
    }

    function closeModal(e?: MouseEvent) {
        e?.preventDefault();
        e?.stopPropagation();
        setShowConfirm(false);
    }

    function handleCancel(e: MouseEvent<HTMLButtonElement>) {
        e.preventDefault();
        e.stopPropagation();
        setError(null);
        startTransition(async () => {
            const res = await cancelVisit(vn, reason.trim() || undefined);
            if (!res.success) {
                setError(res.error || "ยกเลิกไม่สำเร็จ");
                return;
            }
            setShowConfirm(false);
            router.refresh();
        });
    }

    return (
        <>
            <button
                type="button"
                onClick={openModal}
                disabled={pending}
                title="ยกเลิกคิว"
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 shrink-0"
            >
                <Trash2 className="h-4 w-4" />
            </button>

            {showConfirm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
                    onClick={(e) => {
                        // คลิกที่ backdrop = ปิด, คลิกในกล่อง = stop
                        if (e.target === e.currentTarget) closeModal();
                    }}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-5 w-5 text-red-700" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-900">ยกเลิกคิวตรวจ?</h3>
                                <p className="text-sm text-slate-600 mt-0.5">
                                    <span className="font-semibold">{patientName}</span>
                                    <span className="text-slate-400 ml-1">({vn})</span>
                                </p>
                            </div>
                            <button onClick={closeModal} className="rounded-lg p-1 hover:bg-slate-100">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                เหตุผล (ไม่บังคับ)
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="เช่น คนไข้ไม่มา, ขอเลื่อนนัด, ส่งผิดห้อง..."
                                rows={2}
                                disabled={pending}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>

                        {error && (
                            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                            </div>
                        )}

                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                            ⚠ ยกเลิกแล้วจะกู้คืนไม่ได้ — Visit จะถูกตั้ง status เป็น <strong>cancelled</strong>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={closeModal}
                                disabled={pending}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                ไม่ใช่
                            </button>
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={pending}
                                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                <Trash2 className="h-4 w-4" />
                                {pending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
