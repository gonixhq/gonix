export function sumMoney(values: (number | string | null)[]): number {
    return values.reduce<number>((sum, value) => sum + Math.round(Number(value || 0) * 100), 0) / 100;
}
export function outstandingMoney(rows: { total_amount: number | string | null; paid_amount: number | string | null }[]): number {
    return sumMoney(rows.map(r => Math.max(0, Math.round(Number(r.total_amount || 0) * 100) - Math.round(Number(r.paid_amount || 0) * 100)) / 100));
}
