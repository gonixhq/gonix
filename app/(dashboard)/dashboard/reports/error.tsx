"use client";
export default function ReportsError({ reset }: { reset: () => void }) {
    return <div role="alert" className="max-w-xl mx-auto rounded-3xl bg-white/80 border border-white p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">โหลดข้อมูลรายงานไม่สำเร็จ</h2>
        <p className="text-sm text-slate-600 mt-2">กรุณาลองใหม่เพื่อดูยอดและรายการที่ครบถ้วน</p>
        <button onClick={reset} className="mt-5 rounded-xl bg-blue-700 px-5 py-2 text-white">ลองอีกครั้ง</button>
    </div>;
}
