import LineLinkClient from "./line-link-client";

export const dynamic = "force-dynamic";

// หน้า LIFF ผูกบัญชี LINE กับ HN (เปิดในแอป LINE)
export default function LineLinkPage() {
    return (
        <LineLinkClient
            liffId={process.env.NEXT_PUBLIC_LIFF_ID || ""}
            clinicId={process.env.NEXT_PUBLIC_CLINIC_ID || ""}
        />
    );
}
