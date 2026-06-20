import CheckinClient from "./checkin-client";

export const dynamic = "force-dynamic";

// หน้าลงทะเบียนนิรนามสาธารณะ (เข้าผ่าน QR ของคลินิก) — ไม่ต้องล็อกอิน
export default async function CheckinPage({ params }: { params: Promise<{ clinicId: string }> }) {
    const { clinicId } = await params;
    return <CheckinClient clinicId={clinicId} />;
}
