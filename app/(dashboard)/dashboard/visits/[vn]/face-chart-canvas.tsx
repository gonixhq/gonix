"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
    Pencil, Eraser, MapPin, Undo2, Redo2, Trash2, Save,
    Loader2, CheckCircle, X,
} from "lucide-react";
import {
    PEN_COLORS, EMPTY_FACE_CHART,
    type FaceChartData, type PenColor, type Stroke, type Pin,
} from "@/lib/aesthetic-types";
import { saveFaceChart } from "@/lib/actions/aesthetic";

type Tool = "pen" | "eraser" | "pin";

interface Props {
    vn: string;
    initial?: FaceChartData;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const PEN_WIDTH = 2.5;
const ERASER_WIDTH = 20;

export default function FaceChartCanvas({ vn, initial }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const isDrawingRef = useRef(false);
    const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);

    const [tool, setTool] = useState<Tool>("pen");
    const [color, setColor] = useState<PenColor>("red");
    const [strokes, setStrokes] = useState<Stroke[]>(initial?.strokes || []);
    const [pins, setPins] = useState<Pin[]>(initial?.pins || []);
    const [history, setHistory] = useState<{ strokes: Stroke[]; pins: Pin[] }[]>([]);
    const [historyIdx, setHistoryIdx] = useState(-1);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [pinModal, setPinModal] = useState<{ x: number; y: number; existing?: Pin } | null>(null);

    // Save state to history (for undo/redo)
    const pushHistory = useCallback((newStrokes: Stroke[], newPins: Pin[]) => {
        const snapshot = { strokes: newStrokes, pins: newPins };
        const truncated = history.slice(0, historyIdx + 1);
        setHistory([...truncated, snapshot]);
        setHistoryIdx(truncated.length);
        setDirty(true);
        setSaved(false);
    }, [history, historyIdx]);

    // Get pen color hex
    const penHex = PEN_COLORS.find(p => p.value === color)?.hex || "#000";

    // Convert mouse/touch event → canvas coords
    function getCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
        e.preventDefault();
        const { x, y } = getCanvasCoords(e);

        if (tool === "pin") {
            setPinModal({ x, y });
            return;
        }

        isDrawingRef.current = true;
        currentStrokeRef.current = [{ x, y }];
        canvasRef.current?.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!isDrawingRef.current) return;
        const { x, y } = getCanvasCoords(e);
        currentStrokeRef.current.push({ x, y });
        // Live draw on canvas for instant feedback
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        const pts = currentStrokeRef.current;
        if (pts.length < 2) return;
        const prev = pts[pts.length - 2];
        ctx.strokeStyle = tool === "eraser" ? "#ffffff" : penHex;
        ctx.lineWidth = tool === "eraser" ? ERASER_WIDTH : PEN_WIDTH;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;
        canvasRef.current?.releasePointerCapture(e.pointerId);
        const pts = currentStrokeRef.current;
        if (pts.length < 1) return;

        if (tool === "eraser") {
            // Eraser removes strokes that intersect the eraser path
            const newStrokes = strokes.filter(s =>
                !s.points.some(p =>
                    pts.some(ep => Math.hypot(ep.x - p.x, ep.y - p.y) < ERASER_WIDTH)
                )
            );
            setStrokes(newStrokes);
            pushHistory(newStrokes, pins);
        } else {
            const newStroke: Stroke = { points: pts, color, width: PEN_WIDTH };
            const newStrokes = [...strokes, newStroke];
            setStrokes(newStrokes);
            pushHistory(newStrokes, pins);
        }
        currentStrokeRef.current = [];
    }

    // Redraw entire canvas
    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        strokes.forEach(s => {
            ctx.strokeStyle = PEN_COLORS.find(p => p.value === s.color)?.hex || "#000";
            ctx.lineWidth = s.width;
            ctx.beginPath();
            s.points.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
        });
    }, [strokes]);

    useEffect(() => {
        redraw();
    }, [redraw]);

    function handleUndo() {
        if (historyIdx < 0) return;
        const prevIdx = historyIdx - 1;
        if (prevIdx < 0) {
            setStrokes([]);
            setPins([]);
        } else {
            const snap = history[prevIdx];
            setStrokes(snap.strokes);
            setPins(snap.pins);
        }
        setHistoryIdx(prevIdx);
        setDirty(true);
        setSaved(false);
    }

    function handleRedo() {
        if (historyIdx >= history.length - 1) return;
        const nextIdx = historyIdx + 1;
        const snap = history[nextIdx];
        setStrokes(snap.strokes);
        setPins(snap.pins);
        setHistoryIdx(nextIdx);
        setDirty(true);
        setSaved(false);
    }

    function handleClearAll() {
        if (!confirm("ล้างทั้งหมด?")) return;
        setStrokes([]);
        setPins([]);
        pushHistory([], []);
    }

    function handleDeletePin(id: string) {
        const newPins = pins.filter(p => p.id !== id);
        setPins(newPins);
        pushHistory(strokes, newPins);
    }

    function handlePinSave(label: string, pinColor: PenColor) {
        if (!pinModal) return;
        if (pinModal.existing) {
            // Edit existing
            const newPins = pins.map(p => p.id === pinModal.existing!.id ? { ...p, label, color: pinColor } : p);
            setPins(newPins);
            pushHistory(strokes, newPins);
        } else {
            // Add new
            const newPin: Pin = {
                id: crypto.randomUUID(),
                x: pinModal.x,
                y: pinModal.y,
                label,
                color: pinColor,
            };
            const newPins = [...pins, newPin];
            setPins(newPins);
            pushHistory(strokes, newPins);
        }
        setPinModal(null);
    }

    async function handleSave() {
        setSaving(true);
        const result = await saveFaceChart(vn, { strokes, pins });
        setSaving(false);
        if (result.success) {
            setSaved(true);
            setDirty(false);
            setTimeout(() => setSaved(false), 2000);
        } else {
            alert(result.error || "บันทึกไม่สำเร็จ");
        }
    }

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-white border-2 border-slate-200">
                {/* Tools */}
                <div className="flex items-center gap-1 pr-3 border-r border-slate-200">
                    <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} title="ปากกาวาด">
                        <Pencil className="h-4 w-4" />
                    </ToolButton>
                    <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} title="ยางลบ">
                        <Eraser className="h-4 w-4" />
                    </ToolButton>
                    <ToolButton active={tool === "pin"} onClick={() => setTool("pin")} title="ปักหมุด">
                        <MapPin className="h-4 w-4" />
                    </ToolButton>
                </div>

                {/* Colors */}
                <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
                    {PEN_COLORS.map(c => (
                        <button
                            key={c.value}
                            type="button"
                            onClick={() => setColor(c.value)}
                            title={c.label}
                            className={`h-8 w-8 rounded-lg border-2 transition-all ${
                                color === c.value ? "border-slate-800 scale-110 shadow-md" : "border-slate-200 hover:border-slate-400"
                            }`}
                            style={{ backgroundColor: c.hex }}
                        />
                    ))}
                </div>

                {/* Undo/Redo/Clear */}
                <div className="flex items-center gap-1 pr-3 border-r border-slate-200">
                    <ToolButton onClick={handleUndo} disabled={historyIdx < 0} title="Undo">
                        <Undo2 className="h-4 w-4" />
                    </ToolButton>
                    <ToolButton onClick={handleRedo} disabled={historyIdx >= history.length - 1} title="Redo">
                        <Redo2 className="h-4 w-4" />
                    </ToolButton>
                    <ToolButton onClick={handleClearAll} title="ล้างทั้งหมด" danger>
                        <Trash2 className="h-4 w-4" />
                    </ToolButton>
                </div>

                {/* Save */}
                <div className="ml-auto flex items-center gap-2">
                    {dirty && <span className="text-xs text-amber-700 font-medium">มีการเปลี่ยนแปลง</span>}
                    {saved && <span className="text-xs text-emerald-700 font-bold inline-flex items-center gap-1"><CheckCircle className="h-3 w-3" /> บันทึกแล้ว</span>}
                    <Button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="rounded-lg h-9 gap-1.5 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white text-sm font-bold disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        บันทึก
                    </Button>
                </div>
            </div>

            {/* Canvas Area */}
            <div ref={wrapRef} className="relative mx-auto rounded-2xl border-2 border-slate-200 bg-white overflow-hidden shadow-sm" style={{ maxWidth: CANVAS_WIDTH }}>
                {/* Face background */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: "url(/face-chart.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                    }}
                />
                {/* Canvas for drawing */}
                <canvas
                    ref={canvasRef}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    className="block w-full touch-none relative"
                    style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                />

                {/* Pins overlay */}
                <div className="absolute inset-0 pointer-events-none">
                    {pins.map(p => {
                        const hex = PEN_COLORS.find(c => c.value === p.color)?.hex || "#dc2626";
                        return (
                            <div
                                key={p.id}
                                className="absolute pointer-events-auto group"
                                style={{
                                    left: `${(p.x / CANVAS_WIDTH) * 100}%`,
                                    top: `${(p.y / CANVAS_HEIGHT) * 100}%`,
                                    transform: "translate(-50%, -50%)",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setPinModal({ x: p.x, y: p.y, existing: p })}
                                    className="block h-3 w-3 rounded-full border-2 border-white shadow-md hover:scale-150 transition-transform"
                                    style={{ backgroundColor: hex }}
                                    title={p.label}
                                />
                                {p.label && (
                                    <div
                                        className="absolute left-1/2 -translate-x-1/2 mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap shadow-sm max-w-[140px] truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                        style={{ backgroundColor: hex, top: "100%" }}
                                    >
                                        {p.label}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Helper text */}
            <p className="text-xs text-slate-500 text-center">
                💡 Tip: ใช้ stylus/Apple Pencil บน iPad ได้ทันที — ลากนิ้วเพื่อวาด · กดปุ่ม &ldquo;ปักหมุด&rdquo; แล้วแตะบนภาพเพื่อเพิ่มจุด
            </p>

            {pinModal && (
                <PinEditModal
                    initial={pinModal.existing}
                    defaultColor={color}
                    onClose={() => setPinModal(null)}
                    onSave={handlePinSave}
                    onDelete={pinModal.existing ? () => { handleDeletePin(pinModal.existing!.id); setPinModal(null); } : undefined}
                />
            )}
        </div>
    );
}

function ToolButton({
    active, onClick, children, title, disabled, danger,
}: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title: string;
    disabled?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                active
                    ? "bg-blue-600 text-white shadow-sm"
                    : danger
                        ? "text-rose-600 hover:bg-rose-50"
                        : "text-slate-600 hover:bg-slate-100"
            }`}
        >
            {children}
        </button>
    );
}

function PinEditModal({
    initial, defaultColor, onClose, onSave, onDelete,
}: {
    initial?: Pin;
    defaultColor: PenColor;
    onClose: () => void;
    onSave: (label: string, color: PenColor) => void;
    onDelete?: () => void;
}) {
    const [label, setLabel] = useState(initial?.label || "");
    const [color, setColor] = useState<PenColor>(initial?.color || defaultColor);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-rose-600" />
                        {initial ? "แก้ไขหมุด" : "เพิ่มหมุด"}
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-sm font-bold text-slate-700 block mb-1.5">ข้อความ</label>
                        <input
                            type="text"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            placeholder="เช่น Filler 0.5ml, Botox 2u"
                            className="w-full h-11 text-[15px] rounded-lg border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-slate-700 block mb-1.5">สี</label>
                        <div className="flex items-center gap-2">
                            {PEN_COLORS.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setColor(c.value)}
                                    className={`h-10 w-10 rounded-lg border-2 transition-all ${
                                        color === c.value ? "border-slate-800 scale-110" : "border-slate-200"
                                    }`}
                                    style={{ backgroundColor: c.hex }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-5 pt-0 flex items-center justify-between gap-2">
                    {onDelete ? (
                        <Button variant="outline" onClick={onDelete} className="rounded-lg text-rose-600 hover:bg-rose-50 hover:border-rose-300">
                            <Trash2 className="h-4 w-4 mr-1.5" /> ลบหมุด
                        </Button>
                    ) : <div />}
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose} className="rounded-lg">ยกเลิก</Button>
                        <Button
                            onClick={() => onSave(label, color)}
                            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {initial ? "บันทึก" : "เพิ่ม"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
