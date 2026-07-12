// รหัสยืนยัน 6 หลักสำหรับคลินิกนิรนาม — เลี่ยงตัวอักษรกำกวม (0/O, 1/I/L)
// ใช้ CSPRNG (crypto) ไม่ใช่ Math.random() เพราะเป็น token ความปลอดภัย (ผล STD)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 ตัว

export function genVerifyCode(len = 6): string {
    const n = ALPHABET.length;
    // rejection sampling กัน modulo bias (แจกแจงตัวอักษรเท่ากันจริง)
    const limit = Math.floor(4294967296 / n) * n; // 2^32 - (2^32 mod n)
    const out: string[] = [];
    const buf = new Uint32Array(1);
    while (out.length < len) {
        globalThis.crypto.getRandomValues(buf);
        if (buf[0] >= limit) continue;
        out.push(ALPHABET[buf[0] % n]);
    }
    return out.join("");
}
