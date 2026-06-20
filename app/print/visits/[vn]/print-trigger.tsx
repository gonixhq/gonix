"use client";

import { useEffect } from "react";

/**
 * Print toolbar (hidden on print) + auto-trigger print dialog on first load.
 * Disabled auto if URL contains ?noauto=1.
 */
export default function PrintTrigger() {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("noauto") === "1") return;
        const t = setTimeout(() => window.print(), 600);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="no-print mb-4 flex items-center justify-between p-3 bg-slate-100 rounded-lg sticky top-0 z-10">
            <p className="text-sm text-slate-600">📄 ตัวอย่างเอกสาร — กดปุ่มเพื่อพิมพ์หรือบันทึก PDF</p>
            <div className="flex gap-2">
                <button onClick={() => window.history.back()}
                    className="px-4 py-2 text-sm rounded-lg bg-white border border-slate-300 hover:bg-slate-50">
                    ← กลับ
                </button>
                <button onClick={() => window.print()}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold">
                    🖨️ พิมพ์ / บันทึก PDF
                </button>
            </div>
        </div>
    );
}
