import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

// ไอคอนแอป (สี่เหลี่ยมจัตุรัส) สร้างจากโลโก้คลินิก — ใช้ใน manifest / แท็บเบราว์เซอร์
export const size = { width: 512, height: 512 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default function Icon() {
    const logo = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "clinic-logo.png")).toString("base64")}`;
    return new ImageResponse(
        (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" width={480} height={200} style={{ objectFit: "contain" }} />
            </div>
        ),
        size,
    );
}
