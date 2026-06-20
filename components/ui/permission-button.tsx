"use client";

import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/auth/permission-context";
import type { ComponentProps } from "react";

/**
 * Wrapper for <Button> that disables itself based on user permission.
 *
 * - If user has `permKey` → renders normally.
 * - If not → disabled + tooltip "คุณไม่มีสิทธิ์".
 *
 * Use for action buttons like "เพิ่ม", "แก้ไข", "ลบ", "อนุมัติ".
 *
 * Example:
 *   <PermissionButton permKey="patients.create" onClick={...}>เพิ่มผู้ป่วย</PermissionButton>
 */
export function PermissionButton({
    permKey,
    children,
    disabled,
    title,
    asChild,
    ...rest
}: ComponentProps<typeof Button> & { permKey: string }) {
    const allowed = useCan(permKey);
    const effectiveDisabled = disabled || !allowed;
    const tooltip = !allowed ? (title || "คุณไม่มีสิทธิ์ใช้งานนี้") : title;

    return (
        <Button
            {...rest}
            disabled={effectiveDisabled}
            title={tooltip}
        >
            {children}
        </Button>
    );
}

/**
 * Conditionally render children only if user has the permission.
 * Use when you want to hide an action entirely, not just disable.
 */
export function PermissionGate({
    permKey,
    children,
    fallback = null,
}: {
    permKey: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
}) {
    const allowed = useCan(permKey);
    return <>{allowed ? children : fallback}</>;
}
