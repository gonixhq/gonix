/**
 * ใส่ลายน้ำ (clinic name + HN + วันที่) มุมล่างซ้ายของรูปก่อน-หลัง ฝั่ง client ก่อนอัปโหลด
 * ป้องกันภาพถูกนำไปใช้ผิดวัตถุประสงค์ — ถ้า process ล้มเหลวจะคืนไฟล์เดิม (ไม่บล็อกการอัปโหลด)
 */
export async function watermarkImage(file: File, text: string): Promise<File> {
    try {
        if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0);

        const minDim = Math.min(canvas.width, canvas.height);
        const pad = Math.round(minDim * 0.02);
        const fontSize = Math.max(14, Math.round(minDim * 0.028));
        ctx.font = `bold ${fontSize}px 'Sarabun', sans-serif`;
        ctx.textBaseline = "alphabetic";

        const metrics = ctx.measureText(text);
        const boxH = fontSize + 10;
        const boxW = metrics.width + 16;
        const x = pad;
        const y = canvas.height - pad;

        // แถบพื้นหลังโปร่งแสง + ข้อความ
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x - 4, y - boxH, boxW, boxH);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(text, x + 4, y - 6);

        const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.92));
        if (!blob) return file;
        const baseName = file.name.replace(/\.[^.]+$/, "");
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
    } catch {
        return file;
    }
}
