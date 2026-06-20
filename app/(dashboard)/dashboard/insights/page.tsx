import { redirect } from "next/navigation";

// รวมเข้ากับหน้า "รายงาน" แล้ว — ดูที่แท็บ "ลูกค้า & ธุรกิจ"
export default function InsightsPage() {
    redirect("/dashboard/reports");
}
