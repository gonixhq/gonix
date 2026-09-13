export function validDate(value: string | undefined, fallback: string): string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value ? value : fallback;
}
export function shiftDate(value: string, days: number): string {
    const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10);
}
export function monday(value: string): string {
    return shiftDate(value, -((new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7));
}
export async function readAll<T>(fetchPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    const rows: T[] = [];
    for (let start = 0; ; start += 500) {
        const { data, error } = await fetchPage(start, start + 499);
        if (error) throw new Error("โหลดข้อมูลการเงินไม่ครบ กรุณาลองใหม่");
        rows.push(...(data || []));
        if ((data?.length || 0) < 500) return rows;
    }
}
