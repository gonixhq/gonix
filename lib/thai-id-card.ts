/**
 * อ่านบัตรประชาชนผ่านโปรแกรม SIAM-ID
 * ────────────────────────────────────────────────────────────
 * SIAM-ID ไม่มี API — แต่เขียนข้อมูลบัตรลงไฟล์ CSV:
 *   Documents\SIAM-ID\Data.txt  (หรือ C:\Program Files\SIAM-ID\SIAM-ID\Data.txt)
 *
 * วิธีใช้: ใช้ File System Access API (Chrome/Edge) ให้ผู้ใช้เลือกไฟล์ Data.txt
 * 1 ครั้ง → จากนั้นกด "อ่านบัตร" จะอ่านแถวล่าสุดของไฟล์มาเติมฟอร์ม
 *
 * รูปแบบคอลัมน์ Data.txt (index):
 *  0 วันที่ 1 เวลา 2 เลขบัตร 3 คำนำหน้า 4 ชื่อ 5 ชื่อกลาง+สกุล
 *  6 คำนำหน้า(E) 7 ชื่อ(E) 8 สกุล(E) 9 วันเกิด 10 เพศ 11 ศาสนา
 *  12 อายุขณะทำบัตร 13 อายุปัจจุบัน 14 บ้านเลขที่ 15 หมู่ 16 ตรอก
 *  17 ซอย 18 ถนน 19 ตำบล 20 อำเภอ 21 จังหวัด 22 วันออกบัตร ...
 */

export interface ThaiIdCard {
    citizenId: string;
    prefixTh: string;
    firstNameTh: string;
    lastNameTh: string;
    firstNameEn: string;
    lastNameEn: string;
    gender: string;     // "M" | "F" | ""
    birthDate: string;  // ISO "YYYY-MM-DD" (ค.ศ.)
    address: string;    // ที่อยู่รวม (fallback)
    addressDetail: string; // บ้านเลขที่ + ตรอก/ซอย/ถนน
    moo: string;        // เลขหมู่ (ตัดคำว่า "หมู่ที่" ออก)
    tambon: string;     // ตำบล (ตัดคำว่า "ตำบล/แขวง" ออก)
    amphoe: string;     // อำเภอ (ตัด "อำเภอ/เขต")
    province: string;   // จังหวัด (ตัด "จังหวัด")
}

const THAI_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** แปลงวันที่ไทย "9 กันยายน 2540" (พ.ศ.) → "1997-09-09" (ค.ศ.) */
/** จัดรูปเลขบัตร ปชช. 13 หลัก → x-xxxx-xxxxx-xx-x */
export function formatThaiId(id?: string | null): string {
    const s = (id || "").replace(/\D/g, "");
    if (s.length !== 13) return id || "";
    return `${s[0]}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s[12]}`;
}

/** ปิดเลขบัตร ปชช. โชว์เฉพาะ 4 หลักท้าย → x-xxxx-xxxxN-NN-N */
export function maskThaiId(id?: string | null): string {
    const s = (id || "").replace(/\D/g, "");
    if (s.length !== 13) return id ? "•••" : "";
    const m = s.slice(0, 9).replace(/./g, "x") + s.slice(9); // ปิด 9 หลักแรก โชว์ 4 หลักท้าย
    return `${m[0]}-${m.slice(1, 5)}-${m.slice(5, 10)}-${m.slice(10, 12)}-${m[12]}`;
}

export function parseThaiDate(s: string): string {
    if (!s) return "";
    const m = s.trim().match(/^(\d{1,2})\s+([ก-๙.]+)\s+(\d{4})$/);
    if (m) {
        const day = m[1].padStart(2, "0");
        const monIdx = THAI_MONTHS.findIndex((mn) => m[2] === mn || m[2].startsWith(mn.slice(0, 3)));
        let year = parseInt(m[3], 10);
        if (year > 2400) year -= 543;
        if (monIdx >= 0) return `${year}-${String(monIdx + 1).padStart(2, "0")}-${day}`;
    }
    // fallback: yyyy-mm-dd / yyyymmdd
    const digits = s.replace(/\D/g, "");
    if (digits.length === 8) {
        let y = parseInt(digits.slice(0, 4), 10);
        if (y > 2400) y -= 543;
        return `${y}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }
    return "";
}

/** map คำนำหน้าจากบัตร → ค่าใน dropdown ของฟอร์ม */
export function mapPrefix(p: string): string {
    const t = (p || "").replace(/\s/g, "");
    if (/^นางสาว|^น\.ส\./.test(t)) return "น.ส.";
    if (/^นาง/.test(t)) return "นาง";
    if (/^นาย/.test(t)) return "นาย";
    if (/^เด็กชาย|^ด\.ช\./.test(t)) return "ด.ช.";
    if (/^เด็กหญิง|^ด\.ญ\./.test(t)) return "ด.ญ.";
    return "";
}

/** parse 1 บรรทัด CSV (รองรับ field ที่อยู่ในเครื่องหมายคำพูด) */
function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
            if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
            else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

/** parse เนื้อหา Data.txt → ข้อมูลบัตรของแถวล่าสุด */
export function parseSiamIdData(text: string): ThaiIdCard {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // ตัด header (บรรทัดที่มี "เลขประจำตัวประชาชน") เหลือเฉพาะแถวข้อมูล → เอาแถวล่าสุด
    const rows = lines.filter((l) => !l.includes("เลขประจำตัวประชาชน"));
    const last = rows[rows.length - 1];
    if (!last) throw new Error("ไม่พบข้อมูลใน Data.txt — เสียบบัตรกับ SIAM-ID แล้วหรือยัง?");

    const c = parseCsvLine(last);
    const genderRaw = c[10] || "";
    const gender = /ชาย|^m|male|^1$/i.test(genderRaw) ? "M" : /หญิง|^f|female|^2$/i.test(genderRaw) ? "F" : "";
    const strip = (s: string | undefined, re: RegExp) => (s || "").trim().replace(re, "").trim();
    const address = [c[14], c[15], c[16], c[17], c[18], c[19], c[20], c[21]]
        .map((x) => (x || "").trim()).filter(Boolean).join(" ");
    // แยกส่วน: บ้านเลขที่ + ตรอก/ซอย/ถนน (ไม่รวมหมู่/ตำบล/อำเภอ/จังหวัด)
    const addressDetail = [c[14], c[16], c[17], c[18]].map((x) => (x || "").trim()).filter(Boolean).join(" ");

    return {
        citizenId: (c[2] || "").replace(/\s/g, ""),
        prefixTh: c[3] || "",
        firstNameTh: c[4] || "",
        lastNameTh: c[5] || "",
        firstNameEn: c[7] || "",
        lastNameEn: c[8] || "",
        gender,
        birthDate: parseThaiDate(c[9] || ""),
        address,
        addressDetail,
        moo: strip(c[15], /^(หมู่ที่|หมู่|ม\.)\s*/),
        tambon: strip(c[19], /^(ตำบล|ต\.|แขวง)\s*/),
        amphoe: strip(c[20], /^(อำเภอ|อ\.|เขต)\s*/),
        province: strip(c[21], /^(จังหวัด|จ\.)\s*/),
    };
}

/** เลือกไฟล์ Data.txt 1 ครั้ง → คืน handle ไว้ใช้อ่านซ้ำ (Chrome/Edge) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pickDataFile(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.showOpenFilePicker !== "function") {
        throw new Error("เบราว์เซอร์นี้ไม่รองรับการอ่านไฟล์ — กรุณาใช้ Chrome หรือ Edge");
    }
    const [handle] = await w.showOpenFilePicker({
        types: [{ description: "SIAM-ID Data", accept: { "text/plain": [".txt"] } }],
        excludeAcceptAllOption: false,
        multiple: false,
    });
    return handle;
}

/** อ่าน + parse บัตรจาก file handle (รองรับ encoding UTF-8 และ TIS-620/Windows-874) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readCardFromHandle(handle: any): Promise<ThaiIdCard> {
    const file = await handle.getFile();
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) {
        // ไฟล์เป็น TIS-620/Windows-874 (ภาษาไทยแบบเก่า)
        try { text = new TextDecoder("windows-874").decode(buf); } catch { /* ใช้ utf-8 ต่อ */ }
    }
    return parseSiamIdData(text);
}

/** เลือก "โฟลเดอร์ SIAM-ID" 1 ครั้ง → อ่าน Data.txt + รูปได้ (Chrome/Edge) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pickSiamIdFolder(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.showDirectoryPicker !== "function") {
        throw new Error("เบราว์เซอร์นี้ไม่รองรับ — กรุณาใช้ Chrome หรือ Edge");
    }
    return await w.showDirectoryPicker({ id: "siamid", mode: "read" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readFolderText(dir: any): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fh: any = null;
    for (const name of ["Data.txt", "Data", "DATA.TXT", "data.txt"]) {
        try { fh = await dir.getFileHandle(name); break; } catch { /* ลองชื่อถัดไป */ }
    }
    if (!fh) throw new Error("ไม่พบไฟล์ Data ในโฟลเดอร์ — เลือกโฟลเดอร์ SIAM-ID ให้ถูกต้อง");
    const buf = await (await fh.getFile()).arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) { try { text = new TextDecoder("windows-874").decode(buf); } catch { /* ใช้ utf-8 */ } }
    return text;
}

/** อ่านบัตร + รูป จากโฟลเดอร์ (รูปชื่อ <เลขบัตร>.jpg/.bmp/.png) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readCardFromFolder(dir: any): Promise<{ card: ThaiIdCard; photo: File | null }> {
    const card = parseSiamIdData(await readFolderText(dir));
    // ไล่ดูไฟล์ในโฟลเดอร์ → หารูป (ทนทุกนามสกุล/ตัวพิมพ์ใหญ่-เล็ก)
    let photo: File | null = null;
    let fallback: File | null = null;
    const idLower = (card.citizenId || "").toLowerCase();
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const entry of (dir as any).values()) {
            if (entry.kind !== "file") continue;
            const name: string = entry.name;
            const lower = name.toLowerCase();
            if (!/\.(jpe?g|bmp|png)$/.test(lower)) continue;
            const f = await entry.getFile();
            const file = new File([await f.arrayBuffer()], name, { type: f.type || "image/jpeg" });
            if (idLower && lower.startsWith(idLower)) { photo = file; break; }  // ตรงเลขบัตร = เอาเลย
            if (!fallback) fallback = file;                                     // ไม่งั้นเก็บรูปแรกไว้
        }
    } catch { /* อ่านโฟลเดอร์ไม่ได้ → ไม่มีรูป */ }
    return { card, photo: photo || fallback };
}
