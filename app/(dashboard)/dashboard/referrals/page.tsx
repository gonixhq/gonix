import { gatePermission } from "@/lib/auth/guard";
import { getClinicReferrals } from "@/lib/actions/patient-referrals";
import ReferralsClient from "./referrals-client";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
    await gatePermission("finance.view");
    const referrals = await getClinicReferrals();
    return <ReferralsClient referrals={referrals} />;
}
