import { getMyTimeStatus, getClinicLocation } from "@/lib/actions/compensation";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import CheckinClient from "./checkin-client";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
    const [status, location, perms] = await Promise.all([
        getMyTimeStatus(),
        getClinicLocation(),
        getEffectivePermissionsForUser(),
    ]);

    return (
        <CheckinClient
            status={status}
            location={location}
            canConfig={perms.permissions["staff.manage"] === true}
        />
    );
}
