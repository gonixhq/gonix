/**
 * Bangkok timezone helpers.
 * Use these everywhere we store visit/appointment dates/times,
 * so they reflect the wall-clock time the user sees — not UTC.
 */

const TZ = "Asia/Bangkok";

/**
 * Returns Bangkok now as { date: "YYYY-MM-DD", time: "HH:mm:ss" }
 * Safe for inserting into Postgres `date` / `time` columns.
 */
export function bangkokNow(d: Date = new Date()): { date: string; time: string; iso: string } {
    const fmt = new Intl.DateTimeFormat("sv-SE", {
        timeZone: TZ,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    const time = `${get("hour")}:${get("minute")}:${get("second")}`;
    return { date, time, iso: `${date}T${time}+07:00` };
}

/** Bangkok date only — "YYYY-MM-DD" */
export function bangkokDate(d: Date = new Date()): string {
    return bangkokNow(d).date;
}

/** Bangkok time only — "HH:mm:ss" */
export function bangkokTime(d: Date = new Date()): string {
    return bangkokNow(d).time;
}
