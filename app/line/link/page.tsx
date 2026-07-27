import LineLinkClient from "./line-link-client";

export const dynamic = "force-dynamic";

// หน้า LIFF ผูกบัญชี LINE — โหมดคนไข้ (HN+เบอร์) หรือโหมดพนักงาน (?mode=staff&t=token)
export default async function LineLinkPage({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string; t?: string }>;
}) {
    const sp = await searchParams;
    return (
        <LineLinkClient
            liffId={process.env.NEXT_PUBLIC_LIFF_ID_LINK || ""}
            clinicId={process.env.NEXT_PUBLIC_CLINIC_ID || ""}
            staffMode={sp.mode === "staff"}
            staffToken={sp.t || ""}
        />
    );
}
