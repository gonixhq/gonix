import ResultClient from "./result-client";

export const dynamic = "force-dynamic";

// หน้าเช็คผลออนไลน์ (public — คนไข้เข้าด้วย Verify Code + เบอร์ 4 ตัวท้าย)
export default async function ResultPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
    const sp = await searchParams;
    return <ResultClient initialCode={sp.code || ""} />;
}
