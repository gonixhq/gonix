import { TrendingUp, AlertTriangle } from "lucide-react";
import type { BusyForecast } from "@/lib/actions/dashboard-forecast";

const fmtHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** การ์ดพยากรณ์ช่วงคิวแน่นของวันนี้ (เฉลี่ยจากวันเดียวกัน 4 สัปดาห์ย้อนหลัง) */
export function BusyForecastCard({ forecast, nowHour }: { forecast: BusyForecast; nowHour: number }) {
    if (forecast.weeks === 0) return null;
    const max = Math.max(...forecast.hours.map((h) => h.avg), 1);
    const peakSet = new Set(forecast.peakHours);
    const approaching = forecast.peakHours.some((h) => nowHour === h - 1);
    const inPeak = peakSet.has(nowHour);

    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-[#2B54F0]" />
                <h2 className="text-base font-bold text-slate-800">พยากรณ์ช่วงคิวแน่นวันนี้</h2>
            </div>
            <p className="text-xs text-slate-500 mb-3">
                เฉลี่ยจากวันเดียวกัน {forecast.weeks} สัปดาห์ย้อนหลัง
                {forecast.peakHours.length > 0 && (
                    <> · มักแน่นช่วง <span className="font-bold text-slate-700">{forecast.peakHours.map((h) => `${fmtHour(h)}–${fmtHour(h + 1)}`).join(", ")}</span></>
                )}
            </p>

            {(approaching || inPeak) && (
                <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 inline-flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {inPeak ? "ตอนนี้อยู่ในช่วงพีค — เตรียมกำลังคน" : "ใกล้ช่วงพีคในอีก 1 ชม. — เตรียมเรียกเสริม"}
                </div>
            )}

            <div className="flex items-end gap-1 h-24">
                {forecast.hours.map((h) => {
                    const pct = Math.round((h.avg / max) * 100);
                    const isPeak = peakSet.has(h.hour);
                    const isNow = h.hour === nowHour;
                    return (
                        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end gap-1 group" title={`${fmtHour(h.hour)} · เฉลี่ย ${h.avg} คน`}>
                            <div
                                className={`w-full rounded-t-md transition-all ${
                                    isNow ? "bg-[#2B54F0]" : isPeak ? "bg-red-400" : "bg-slate-200"
                                }`}
                                style={{ height: `${Math.max(pct, 4)}%` }}
                            />
                            <span className={`text-[9px] ${isNow ? "font-bold text-[#2B54F0]" : "text-slate-400"}`}>{h.hour}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
