import { redirect } from "next/navigation";

// กระดานคิวถูกปลดออกจากเมนูแล้ว — หน้าแรกใช้ Overview แทน
export default function DashboardRootPage() {
    redirect("/dashboard/overview");
}
