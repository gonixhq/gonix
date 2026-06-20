/**
 * Aesthetic visit records — types shared between server & client.
 * Stored in visits.aesthetic_records (jsonb).
 */

export type PenColor = "red" | "blue" | "black" | "amber";

export const PEN_COLORS: { value: PenColor; label: string; hex: string }[] = [
    { value: "red", label: "แดง", hex: "#dc2626" },
    { value: "blue", label: "น้ำเงิน", hex: "#2563eb" },
    { value: "black", label: "ดำ", hex: "#111827" },
    { value: "amber", label: "เหลือง", hex: "#f59e0b" },
];

export interface Stroke {
    points: { x: number; y: number }[];
    color: PenColor;
    width: number;
}

export interface Pin {
    id: string;
    x: number;
    y: number;
    label: string;
    color: PenColor;
}

export interface FaceChartData {
    strokes: Stroke[];
    pins: Pin[];
    updated_at?: string;
}

export interface AestheticPhoto {
    path: string;       // storage path
    url: string;        // public/signed URL
    label?: string;     // หน้าตรง / ซ้าย / ขวา
    uploaded_at: string;
}

export interface AestheticRecords {
    face_chart?: FaceChartData;
    photos?: {
        before?: AestheticPhoto[];
        after?: AestheticPhoto[];
    };
    treatment_notes?: string;
}

export const EMPTY_FACE_CHART: FaceChartData = {
    strokes: [],
    pins: [],
};
