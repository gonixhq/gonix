/**
 * Loyalty tier definitions — shared between server & client.
 * (Cannot live in "use server" file because Next.js requires only async exports.)
 */

export interface LoyaltyTier {
    name: string;
    min: number;
    max: number;
}

export const LOYALTY_TIERS: LoyaltyTier[] = [
    { name: "Bronze", min: 0, max: 99 },
    { name: "Silver", min: 100, max: 499 },
    { name: "Gold", min: 500, max: 999 },
    { name: "Platinum", min: 1000, max: Infinity },
];

export function getTierForPoints(points: number) {
    const current = LOYALTY_TIERS.find(t => points >= t.min && points <= t.max) || LOYALTY_TIERS[0];
    const idx = LOYALTY_TIERS.indexOf(current);
    const next = idx < LOYALTY_TIERS.length - 1 ? LOYALTY_TIERS[idx + 1] : null;
    const pointsToNext = next ? next.min - points : 0;
    const progressPct = next
        ? Math.min(100, Math.max(0, Math.round(((points - current.min) / (next.min - current.min)) * 100)))
        : 100;
    return { current, next, pointsToNext, progressPct };
}
