"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2, X, Trash2 } from "lucide-react";
import { deletePatient } from "@/lib/actions/patients";

export default function DeletePatientModal({
    hn,
    patientName,
    onClose,
}: {
    hn: string;
    patientName: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const [confirmText, setConfirmText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    async function handleDelete() {
        setLoading(true);
        setError("");
        const res = await deletePatient(hn, confirmText);
        setLoading(false);
        if (!res.success) {
            setError(res.error || "ลบไม่สำเร็จ");
            return;
        }
        onClose();
        router.refresh();
    }

    const canDelete = confirmText === hn;

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-4 border-b border-red-200 bg-red-50 rounded-t-2xl flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                        <Trash2 className="h-5 w-5 text-red-700" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-bold text-red-900">ลบผู้ป่วย</h3>
                        <p className="text-xs text-red-700 mt-0.5">การดำเนินการนี้ไม่สามารถยกเลิกได้</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-red-100">
                        <X className="h-4 w-4 text-red-700" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Warning */}
                    <div className="rounded-xl border-2 border-red-200 bg-red-50/50 px-4 py-3">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                            <div className="text-sm text-red-900 leading-relaxed">
                                <p className="font-bold">กำลังจะลบ:</p>
                                <p className="mt-1">
                                    <strong>{patientName}</strong>{" "}
                                    <span className="font-mono text-xs bg-red-100 px-1.5 py-0.5 rounded">{hn}</span>
                                </p>
                                <ul className="text-xs mt-2 space-y-0.5 list-disc list-inside">
                                    <li>ประวัติ Visit ทั้งหมด + รายการยา + Vital signs</li>
                                    <li>ใบรับรองแพทย์ + การส่งต่อ</li>
                                    <li>นัดหมาย + ประวัติแพ้ + โรคประจำตัว</li>
                                    <li>คะแนนสะสม + audit log</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Confirmation input */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700">
                            พิมพ์ <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-red-700 font-bold">{hn}</code> เพื่อยืนยันการลบ:
                        </label>
                        <Input
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            placeholder={hn}
                            className="rounded-xl font-mono text-sm h-10"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-100 border border-red-300 px-3 py-2 text-sm text-red-800 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={loading} className="rounded-xl">
                        ยกเลิก
                    </Button>
                    <Button
                        onClick={handleDelete}
                        disabled={!canDelete || loading}
                        className="rounded-xl gap-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        ลบถาวร
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
