/** Only identifiers and quantities travel in the print URL; names and directions come from the server. */
export interface LabelSelection { source: "order" | "inventory"; id: string; qty: number }
export function parseLabelSelection(raw: string): LabelSelection[] {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 100) throw new Error("รายการฉลากไม่ถูกต้อง (สูงสุด 100 รายการ)");
    return value.map(row => {
        if (!row || (row.source !== "order" && row.source !== "inventory") ||
            typeof row.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(row.id) ||
            typeof row.qty !== "number" || !Number.isFinite(row.qty) || row.qty <= 0 || row.qty > 1000000) {
            throw new Error("รายการฉลากไม่ถูกต้อง กรุณากลับไปเลือกยาอีกครั้ง");
        }
        return { source: row.source, id: row.id, qty: row.qty };
    });
}
