"use client";

import { useRef, useState } from "react";
import type { PointerEvent } from "react";

type Stroke = { color: string; points: string };
type Sheet = { id: number; name: string; background: string; strokes: Stroke[] };
const button = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-40";
const body = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><rect width="600" height="800" fill="white"/><g fill="none" stroke="#94a3b8" stroke-width="3"><ellipse cx="300" cy="110" rx="44" ry="55"/><path d="M278 164 L278 190 L235 205 L207 295 L180 394 L199 404 L231 318 L251 270 L254 390 L243 475 L252 655 L244 708 L282 708 L286 653 L291 497 L300 452 L309 497 L314 653 L318 708 L356 708 L348 655 L357 475 L346 390 L349 270 L369 318 L401 404 L420 394 L393 295 L365 205 L322 190 L322 164 M254 390 Q300 416 346 390 M279 237 Q300 248 321 237"/></g><text x="300" y="760" text-anchor="middle" fill="#64748b" font-size="16">Body chart · Front / schematic</text></svg>`);

export default function ChartPad({ onCount }: { onCount: (count: number) => void }) {
    const [sheets, setSheets] = useState<Sheet[]>([{ id: 1, name: "Face 1", background: "/face-chart.png", strokes: [] }]);
    const [active, setActive] = useState(1);
    const [color, setColor] = useState("#2563eb");
    const [erase, setErase] = useState(false);
    const [redo, setRedo] = useState<Stroke[]>([]);
    const [message, setMessage] = useState("");
    const drawing = useRef(false);
    const sheet = sheets.find(s => s.id === active)!;
    function edit(patch: Partial<Sheet>) { setSheets(old => old.map(s => s.id === active ? { ...s, ...patch } : s)); setMessage(""); }
    function add(name: string, background: string) { const id = Date.now(); setSheets(old => [...old, { id, name, background, strokes: [] }]); setActive(id); setRedo([]); onCount(sheets.length + 1); setMessage(""); }
    function point(e: PointerEvent<SVGSVGElement>) { const r = e.currentTarget.getBoundingClientRect(); return `${Math.max(0, Math.min(600, (e.clientX - r.left) * 600 / r.width)).toFixed(1)},${Math.max(0, Math.min(800, (e.clientY - r.top) * 800 / r.height)).toFixed(1)}`; }
    function finish() { drawing.current = false; }
    async function photo(file?: File) {
        if (!file) return;
        if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) { setMessage("เลือกรูปภาพไม่เกิน 10 MB"); return; }
        const reader = new FileReader(); reader.onload = () => add(file.name, String(reader.result)); reader.onerror = () => setMessage("อ่านภาพไม่สำเร็จ"); reader.readAsDataURL(file);
    }
    function save() {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, sheets })], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = "gonix-demo-charts.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("ส่งไฟล์แผ่นวาดให้เบราว์เซอร์ดาวน์โหลดแล้ว");
    }
    async function restore(file?: File) {
        if (!file) return;
        try {
            if (file.size > 30 * 1024 * 1024) throw Error();
            const data = JSON.parse(await file.text());
            if (data.version !== 1 || !Array.isArray(data.sheets) || !data.sheets.length || data.sheets.length > 30) throw Error();
            const restored: Sheet[] = data.sheets.map((s: Sheet, i: number) => {
                if (typeof s.name !== "string" || typeof s.background !== "string" || !(s.background === "" || s.background === "/face-chart.png" || /^data:image\/(png|jpeg|webp|gif);base64,/.test(s.background) || s.background === body) || !Array.isArray(s.strokes) || !s.strokes.every(t => /^#[0-9a-f]{6}$/i.test(t.color) && typeof t.points === "string" && /^[0-9., ]+$/.test(t.points))) throw Error();
                return { ...s, id: i + 1 };
            });
            setSheets(restored); setActive(restored[0].id); onCount(restored.length); setRedo([]); setMessage("เปิดแผ่นวาดแล้ว สามารถวาดต่อได้");
        } catch { setMessage("เปิดไฟล์ไม่ได้ กรุณาเลือกไฟล์แผ่นวาดจากต้นแบบนี้"); }
    }
    return <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <h3 className="font-semibold">แผ่นวาดและภาพประกอบ</h3>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => add("Face", "/face-chart.png")}>+ Face</button><button className={button} onClick={() => add("Body", body)}>+ Body</button><button className={button} onClick={() => add("กระดาษเปล่า", "")}>+ กระดาษเปล่า</button><label className={`${button} cursor-pointer`}>อัปโหลดภาพ<input className="sr-only" type="file" accept="image/*" onChange={e => { void photo(e.target.files?.[0]); e.target.value = ""; }} /></label><label className={`${button} cursor-pointer`}>ถ่ายภาพ<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={e => { void photo(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        <div className="flex flex-wrap gap-2">{sheets.map(s => <button key={s.id} aria-pressed={active === s.id} className={`${button} max-w-full break-words ${active === s.id ? "!bg-blue-700 !text-white" : ""}`} onClick={() => { setActive(s.id); setRedo([]); }}>{s.name}</button>)}</div>
        <label className="block text-xs text-slate-500">ชื่อแผ่น<input className="mt-1 w-full rounded-lg border p-2 text-sm text-slate-800" value={sheet.name} onChange={e => edit({ name: e.target.value })} /></label>
        <div className="flex flex-wrap items-center gap-2"><label className="text-xs">สี <input aria-label="สีปากกา" type="color" value={color} onChange={e => { setColor(e.target.value); setErase(false); }} /></label><button className={button} aria-pressed={!erase} onClick={() => setErase(false)}>ปากกา</button><button className={`${button} ${erase ? "!bg-blue-100" : ""}`} aria-pressed={erase} onClick={() => setErase(true)}>ลบเส้น</button><button className={button} disabled={!sheet.strokes.length} onClick={() => { setRedo(r => [...r, sheet.strokes[sheet.strokes.length - 1]]); edit({ strokes: sheet.strokes.slice(0, -1) }); }}>ย้อนกลับ</button><button className={button} disabled={!redo.length} onClick={() => { edit({ strokes: [...sheet.strokes, redo[redo.length - 1]] }); setRedo(r => r.slice(0, -1)); }}>ทำซ้ำ</button></div>
        <svg viewBox="0 0 600 800" aria-label="พื้นที่วาด ใช้เมาส์ นิ้ว หรือปากกา" className="w-full touch-none rounded-xl border border-slate-200 bg-white" onPointerDown={e => { if (erase) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const p = point(e); edit({ strokes: [...sheet.strokes, { color, points: `${p} ${p}` }] }); setRedo([]); }} onPointerMove={e => { if (!drawing.current) return; const p = point(e); setSheets(old => old.map(s => s.id === active ? { ...s, strokes: s.strokes.map((t, i) => i === s.strokes.length - 1 ? { ...t, points: `${t.points} ${p}` } : t) } : s)); }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
            {sheet.background && <image href={sheet.background} width="600" height="800" preserveAspectRatio="xMidYMid meet" />}
            {sheet.strokes.map((s, i) => <polyline key={i} points={s.points} stroke={s.color} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents={erase ? "stroke" : "none"} onPointerDown={e => { if (erase) { e.stopPropagation(); edit({ strokes: sheet.strokes.filter((_, n) => n !== i) }); setRedo([]); } }} />)}
        </svg>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={save}>ดาวน์โหลดแผ่นวาด</button><label className={`${button} cursor-pointer`}>เปิดไฟล์แผ่นวาด<input type="file" accept=".json" className="sr-only" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        <p className="text-xs leading-relaxed text-slate-500">ต้นแบบเก็บภาพกับรอยวาดแยกกันในไฟล์ เปิดกลับมาแก้ได้ • Body เป็นภาพร่างด้านหน้า • การเปิดกล้องขึ้นอยู่กับอุปกรณ์</p><p role="status" className="text-sm text-blue-700">{message}</p>
    </div>;
}
