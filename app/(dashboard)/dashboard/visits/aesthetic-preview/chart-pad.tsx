"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, MapPin } from "lucide-react";
import type { PointerEvent } from "react";

type Stroke = { color: string; points: string };
type Pin = { id: number; x: number; y: number; amount: string; color: string };
type Drawing = { strokes: Stroke[]; pins: Pin[] };
type Sheet = { id: number; name: string; background: string; strokes: Stroke[]; pins: Pin[] };
const button = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-40";
const body = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><rect width="600" height="800" fill="white"/><g fill="none" stroke="#94a3b8" stroke-width="3"><ellipse cx="300" cy="110" rx="44" ry="55"/><path d="M278 164 L278 190 L235 205 L207 295 L180 394 L199 404 L231 318 L251 270 L254 390 L243 475 L252 655 L244 708 L282 708 L286 653 L291 497 L300 452 L309 497 L314 653 L318 708 L356 708 L348 655 L357 475 L346 390 L349 270 L369 318 L401 404 L420 394 L393 295 L365 205 L322 190 L322 164 M254 390 Q300 416 346 390 M279 237 Q300 248 321 237"/></g><text x="300" y="760" text-anchor="middle" fill="#64748b" font-size="16">Body chart · Front / schematic</text></svg>`);

export default function ChartPad({ onCount }: { onCount: (count: number) => void }) {
    const [sheets, setSheets] = useState<Sheet[]>([{ id: 1, name: "Face 1", background: "/face-chart.png", strokes: [], pins: [] }]);
    const [active, setActive] = useState(1);
    const [color, setColor] = useState("#2563eb");
    const [erase, setErase] = useState(false);
    const [redo, setRedo] = useState<Drawing[]>([]);
    const [undo, setUndo] = useState<Drawing[]>([]);
    const [pinMode, setPinMode] = useState(false);
    const [draftPin, setDraftPin] = useState<Pin | null>(null);
    const [message, setMessage] = useState("");
    const drawing = useRef(false);
    const container = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [renaming, setRenaming] = useState(false);
    useEffect(() => {
        const sync = () => setExpanded(document.fullscreenElement === container.current);
        document.addEventListener("fullscreenchange", sync);
        return () => document.removeEventListener("fullscreenchange", sync);
    }, []);
    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement === container.current) await document.exitFullscreen();
            else await container.current?.requestFullscreen();
        } catch { setMessage("อุปกรณ์นี้ไม่รองรับการขยายเต็มจอ"); }
    }
    const sheet = sheets.find(s => s.id === active)!;
    function edit(patch: Partial<Sheet>) { setSheets(old => old.map(s => s.id === active ? { ...s, ...patch } : s)); setMessage(""); }
    function checkpoint() { setUndo(old => [...old, { strokes: sheet.strokes, pins: sheet.pins }]); setRedo([]); }
    function undoDrawing() {
        if (!undo.length) return;
        setRedo(old => [...old, { strokes: sheet.strokes, pins: sheet.pins }]);
        edit(undo[undo.length - 1]); setUndo(old => old.slice(0, -1)); setDraftPin(null);
    }
    function redoDrawing() {
        if (!redo.length) return;
        setUndo(old => [...old, { strokes: sheet.strokes, pins: sheet.pins }]);
        edit(redo[redo.length - 1]); setRedo(old => old.slice(0, -1)); setDraftPin(null);
    }
    function savePin() {
        if (!draftPin || !Number.isFinite(Number(draftPin.amount)) || Number(draftPin.amount) <= 0) return;
        checkpoint();
        edit({ pins: [...sheet.pins.filter(p => p.id !== draftPin.id), draftPin] }); setDraftPin(null);
    }
    function add(name: string, background: string) { const id = Date.now(); setSheets(old => [...old, { id, name, background, strokes: [], pins: [] }]); setActive(id); setRedo([]); setUndo([]); setDraftPin(null); onCount(sheets.length + 1); setMessage(""); }
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
                const pins = s.pins ?? [];
                if (!Array.isArray(pins) || !pins.every(p => Number.isFinite(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 600 && p.y >= 0 && p.y <= 800 && typeof p.amount === "string" && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0 && /^#[0-9a-f]{6}$/i.test(p.color))) throw Error();
                return { ...s, id: i + 1, pins };
            });
            setSheets(restored); setActive(restored[0].id); onCount(restored.length); setRedo([]); setUndo([]); setDraftPin(null); setMessage("เปิดแผ่นวาดแล้ว สามารถวาดต่อได้");
        } catch { setMessage("เปิดไฟล์ไม่ได้ กรุณาเลือกไฟล์แผ่นวาดจากต้นแบบนี้"); }
    }
    return <div ref={container} className={`space-y-2 rounded-2xl border border-slate-200 p-3 ${expanded ? "overflow-y-auto bg-white" : "bg-slate-50/60"}`}>
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">แผ่นวาดและภาพประกอบ</h3><button className={button} onClick={() => void toggleFullscreen()}>{expanded ? "ย่อกลับ" : "ขยายเต็มจอ"}</button></div>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => add("Face", "/face-chart.png")}>+ Face</button><button className={button} onClick={() => add("Body", body)}>+ Body</button><button className={button} onClick={() => add("กระดาษเปล่า", "")}>+ กระดาษเปล่า</button><label className={`${button} cursor-pointer`}>อัปโหลดภาพ<input className="sr-only" type="file" accept="image/*" onChange={e => { void photo(e.target.files?.[0]); e.target.value = ""; }} /></label><label className={`${button} cursor-pointer`}>ถ่ายภาพ<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={e => { void photo(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        <div className="flex flex-wrap gap-2">{sheets.map(s => <button key={s.id} aria-pressed={active === s.id} className={`${button} max-w-full break-words ${active === s.id ? "!bg-blue-700 !text-white" : ""}`} title="กดแผ่นที่เลือกเพื่อเปลี่ยนชื่อ" onClick={() => { setRenaming(active === s.id ? !renaming : false); if (active !== s.id) { setRedo([]); setUndo([]); setDraftPin(null); } setActive(s.id); }}>{s.name}</button>)}</div>
        {renaming && <label className="block text-xs text-slate-500">ชื่อแผ่น<input autoFocus className="mt-1 w-full rounded-lg border p-2 text-sm text-slate-800" value={sheet.name} onChange={e => edit({ name: e.target.value })} onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setRenaming(false); }} /></label>}
        <div className="flex flex-wrap items-center gap-2"><label className="text-xs">สี <input aria-label="สีปากกา" type="color" value={color} onChange={e => { setColor(e.target.value); setErase(false); }} /></label><button className={button} aria-pressed={!erase && !pinMode} onClick={() => { setErase(false); setPinMode(false); }}>ปากกา</button><button className={`${button} ${erase ? "!bg-blue-100" : ""}`} aria-pressed={erase} onClick={() => { setErase(true); setPinMode(false); }}>ลบเส้น</button><button className={`${button} inline-flex items-center gap-1 ${pinMode ? "!bg-blue-100" : ""}`} aria-pressed={pinMode} onClick={() => { setPinMode(true); setErase(false); }}><MapPin size={16} /> จุด / cc</button><button className={button} title="ย้อนกลับ" aria-label="ย้อนกลับ" disabled={!undo.length} onClick={undoDrawing}><Undo2 size={18} /></button><button className={button} title="ทำซ้ำ" aria-label="ทำซ้ำ" disabled={!redo.length} onClick={redoDrawing}><Redo2 size={18} /></button></div>
        <svg viewBox="0 0 600 800" aria-label="พื้นที่วาด ใช้เมาส์ นิ้ว หรือปากกา" className="mx-auto block touch-none rounded-xl border border-slate-200 bg-white" style={{ width: expanded ? "min(100%, calc(68dvh * 0.75))" : "min(100%, 300px, calc(48dvh * 0.75))", aspectRatio: "3 / 4" }} onPointerDown={e => { if (erase) return; if (pinMode) { const [x, y] = point(e).split(",").map(Number); setDraftPin({ id: Date.now(), x, y, amount: "", color }); return; } checkpoint(); e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const p = point(e); edit({ strokes: [...sheet.strokes, { color, points: `${p} ${p}` }] }); setRedo([]); }} onPointerMove={e => { if (!drawing.current) return; const p = point(e); setSheets(old => old.map(s => s.id === active ? { ...s, strokes: s.strokes.map((t, i) => i === s.strokes.length - 1 ? { ...t, points: `${t.points} ${p}` } : t) } : s)); }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
            {sheet.background && <image href={sheet.background} width="600" height="800" preserveAspectRatio="xMidYMid meet" />}
            {sheet.strokes.map((s, i) => <polyline key={i} points={s.points} stroke={s.color} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents={erase ? "stroke" : "none"} onPointerDown={e => { if (erase) { e.stopPropagation(); checkpoint(); edit({ strokes: sheet.strokes.filter((_, n) => n !== i) }); setRedo([]); } }} />)}
            {sheet.pins.map(p => <g key={p.id} role="button" tabIndex={0} aria-label={`แก้ไขจุด ${p.amount} cc`} className="cursor-pointer outline-none focus:opacity-60" onPointerDown={e => { e.stopPropagation(); setDraftPin({ ...p }); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDraftPin({ ...p }); } }}>
                <circle cx={p.x} cy={p.y} r={15} fill={p.color} stroke="white" strokeWidth={3} />
                <text x={Math.max(70, Math.min(530, p.x))} y={p.y > 755 ? p.y - 24 : p.y + 34} textAnchor="middle" fontSize={24} fontWeight={600} fill={p.color} stroke="white" strokeWidth={5} paintOrder="stroke">{p.amount} cc</text>
            </g>)}
        </svg>
        {draftPin && <form onSubmit={e => { e.preventDefault(); savePin(); }} className="flex flex-wrap items-end gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
            <label className="text-sm">จำนวน cc<input autoFocus type="number" min="0.001" step="any" required className="mt-1 block w-28 rounded-lg border border-slate-200 bg-white p-2" value={draftPin.amount} onChange={e => setDraftPin({ ...draftPin, amount: e.target.value })} /></label>
            <button type="submit" className={`${button} !bg-blue-700 !text-white`}>บันทึกจุด</button>
            {sheet.pins.some(p => p.id === draftPin.id) && <button type="button" className={button} onClick={() => { checkpoint(); edit({ pins: sheet.pins.filter(p => p.id !== draftPin.id) }); setDraftPin(null); }}>ลบจุด</button>}
            <button type="button" className={button} onClick={() => setDraftPin(null)}>ยกเลิก</button>
        </form>}
        {pinMode && !draftPin && <p className="text-xs text-blue-700">แตะบนภาพเพื่อปักจุด กดจุดเดิมเพื่อแก้ไขจำนวนหรือลบ</p>}
        {sheet.pins.length > 0 && <p className="text-sm text-slate-600">{sheet.pins.length} จุด · รวมบนแผ่นนี้ {Number(sheet.pins.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(3))} cc <span className="text-xs">(ยังไม่เชื่อมปริมาณสินค้า)</span></p>}
        <div className="flex flex-wrap gap-2"><button className={button} onClick={save}>ดาวน์โหลดแผ่นวาด</button><label className={`${button} cursor-pointer`}>เปิดไฟล์แผ่นวาด<input type="file" accept=".json" className="sr-only" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        <p className="text-xs leading-relaxed text-slate-500">ต้นแบบเก็บภาพกับรอยวาดแยกกันในไฟล์ เปิดกลับมาแก้ได้ • Body เป็นภาพร่างด้านหน้า • การเปิดกล้องขึ้นอยู่กับอุปกรณ์</p><p role="status" className="text-sm text-blue-700">{message}</p>
    </div>;
}
