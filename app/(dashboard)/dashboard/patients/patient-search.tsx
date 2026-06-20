"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function PatientSearch({ defaultValue = "" }: { defaultValue?: string }) {
    const router = useRouter();
    const [value, setValue] = useState(defaultValue);
    const [isPending, startTransition] = useTransition();

    function handleSearch(term: string) {
        setValue(term);
        startTransition(() => {
            const params = new URLSearchParams();
            if (term) params.set("q", term);
            router.push(`/dashboard/patients${term ? `?${params.toString()}` : ""}`);
        });
    }

    return (
        <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="ค้นหา HN, ชื่อ, นามสกุล, เบอร์โทร..."
                value={value}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
            />
            {isPending && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            )}
        </div>
    );
}
