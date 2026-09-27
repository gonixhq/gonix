import FinanceSubnav from "@/components/finance/finance-subnav";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
    const { permissions } = await getEffectivePermissionsForUser();
    return (
        <>
            <FinanceSubnav canReports={permissions["finance.reports"] === true} canCommission={permissions["finance.commission"] === true} />
            {children}
        </>
    );
}
