// รหัสยืนยัน 6 หลักสำหรับคลินิกนิรนาม — เลี่ยงตัวอักษรกำกวม (0/O, 1/I/L)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function genVerifyCode(len = 6): string {
    let s = "";
    for (let i = 0; i < len; i++) {
        s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return s;
}
