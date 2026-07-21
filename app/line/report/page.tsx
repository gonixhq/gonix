import SelfReportClient from "./self-report-client";

export const dynamic = "force-dynamic";

// หน้า LIFF ให้ผู้ป่วยรายงานอาการเองหลังทำหัตถการ (เปิดในแอป LINE)
export default function SelfReportPage() {
    return (
        <SelfReportClient
            liffId={process.env.NEXT_PUBLIC_LIFF_ID_REPORT || ""}
            clinicId={process.env.NEXT_PUBLIC_CLINIC_ID || ""}
        />
    );
}
