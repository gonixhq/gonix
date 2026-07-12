"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatThaiId, maskThaiId } from "@/lib/thai-id-card";

/**
 * แสดงเลขบัตร ปชช. แบบปิด (โชว์ 4 หลักท้าย) + ปุ่มตาเปิดดูเต็ม
 * ลดการหลุดจากการมองข้ามไหล่/แคปหน้าจอ — default ปิดไว้ก่อน
 */
export function MaskedId({ value, className }: { value?: string | null; className?: string }) {
    const [show, setShow] = useState(false);
    if (!value) return <span className={className}>—</span>;
    return (
        <span className={`inline-flex items-center gap-1.5 ${className || ""}`}>
            <span className="font-mono tabular-nums">{show ? formatThaiId(value) : maskThaiId(value)}</span>
            <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                title={show ? "ซ่อนเลขบัตร" : "แสดงเลขบัตรเต็ม"}
                aria-label={show ? "ซ่อนเลขบัตร" : "แสดงเลขบัตรเต็ม"}
            >
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
        </span>
    );
}
