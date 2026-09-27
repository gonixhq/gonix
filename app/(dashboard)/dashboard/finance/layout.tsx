import FinanceSubnav from "@/components/finance/finance-subnav";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <FinanceSubnav />
            {children}
        </>
    );
}
