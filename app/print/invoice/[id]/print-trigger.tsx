"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function PrintTrigger() {
    const searchParams = useSearchParams();
    const noauto = searchParams.get("noauto");

    useEffect(() => {
        // Wire up manual print button
        const btn = document.getElementById("print-now-btn");
        const handler = () => window.print();
        if (btn) btn.addEventListener("click", handler);

        // Auto-print on page load unless ?noauto=1
        if (!noauto) {
            const t = setTimeout(() => window.print(), 500);
            return () => {
                clearTimeout(t);
                if (btn) btn.removeEventListener("click", handler);
            };
        }
        return () => {
            if (btn) btn.removeEventListener("click", handler);
        };
    }, [noauto]);

    return null;
}
