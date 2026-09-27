// แปลงจำนวนเงินเป็นตัวอักษรภาษาไทย เช่น 1250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"
const DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const UNIT = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readInt(n: number): string {
    if (n === 0) return "";
    if (n >= 1_000_000) return readInt(Math.floor(n / 1_000_000)) + "ล้าน" + readInt(n % 1_000_000);
    const s = String(n);
    let out = "";
    for (let i = 0; i < s.length; i++) {
        const d = Number(s[i]), pos = s.length - i - 1;
        if (d === 0) continue;
        if (pos === 1 && d === 1) out += "สิบ";
        else if (pos === 1 && d === 2) out += "ยี่สิบ";
        else if (pos === 0 && d === 1 && s.length > 1) out += "เอ็ด";
        else out += DIGIT[d] + UNIT[pos];
    }
    return out;
}

export function bahtText(amount: number): string {
    const v = Math.round(Math.abs(amount) * 100);
    const baht = Math.floor(v / 100), satang = v % 100;
    if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";
    const b = baht ? readInt(baht) + "บาท" : "";
    return (amount < 0 ? "ลบ" : "") + b + (satang ? readInt(satang) + "สตางค์" : "ถ้วน");
}
