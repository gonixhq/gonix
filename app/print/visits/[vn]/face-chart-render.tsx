/**
 * Server-side renderable Face Chart — แสดงรูปใบหน้า + เส้นวาด + หมุด
 * ใช้สำหรับ print OPD ของ aesthetic visit
 */

import type { FaceChartData } from "@/lib/aesthetic-types";

const PEN_HEX: Record<string, string> = {
    red: "#dc2626",
    blue: "#2563eb",
    black: "#111827",
    amber: "#f59e0b",
};

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;

export function FaceChartRender({
    data,
    width = 320,
}: {
    data: FaceChartData | null | undefined;
    /** Display width in px (height auto from aspect ratio) */
    width?: number;
}) {
    if (!data) return null;
    const strokes = data.strokes || [];
    const pins = data.pins || [];
    if (strokes.length === 0 && pins.length === 0) return null;

    const height = (width * CANVAS_HEIGHT) / CANVAS_WIDTH;

    return (
        <div
            className="relative bg-white border border-slate-300 rounded-lg overflow-hidden mx-auto"
            style={{ width, height }}
        >
            {/* Face background */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/face-chart.png"
                alt="Face chart"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* SVG overlay for strokes + pins */}
            <svg
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                className="absolute inset-0 w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Strokes */}
                {strokes.map((stroke, i) => {
                    const hex = PEN_HEX[stroke.color] || "#dc2626";
                    if (stroke.points.length < 2) return null;
                    const d = stroke.points
                        .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                        .join(" ");
                    return (
                        <path
                            key={i}
                            d={d}
                            stroke={hex}
                            strokeWidth={stroke.width || 2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                        />
                    );
                })}

                {/* Pin dots */}
                {pins.map((p, i) => {
                    const hex = PEN_HEX[p.color] || "#dc2626";
                    return (
                        <g key={p.id || i}>
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={8}
                                fill={hex}
                                stroke="white"
                                strokeWidth={2}
                            />
                            <text
                                x={p.x}
                                y={p.y - 14}
                                textAnchor="middle"
                                fontSize={11}
                                fontWeight="bold"
                                fill={hex}
                                stroke="white"
                                strokeWidth={3}
                                paintOrder="stroke"
                            >
                                {i + 1}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
