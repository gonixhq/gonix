"use client";

import { createContext, useContext } from "react";

/**
 * Client-side permission context.
 * Populated once in (dashboard)/layout.tsx with effective permissions
 * computed on the server, then read by any client component via useCan().
 */
const PermissionContext = createContext<Record<string, boolean>>({});

export function PermissionProvider({
    children,
    permissions,
}: {
    children: React.ReactNode;
    permissions: Record<string, boolean>;
}) {
    return (
        <PermissionContext.Provider value={permissions}>
            {children}
        </PermissionContext.Provider>
    );
}

/** True if the current user has this permission */
export function useCan(key: string): boolean {
    const perms = useContext(PermissionContext);
    return perms[key] === true;
}

/** Read multiple permissions at once */
export function useCanAny(keys: string[]): boolean {
    const perms = useContext(PermissionContext);
    return keys.some((k) => perms[k] === true);
}
