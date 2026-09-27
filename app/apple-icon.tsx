import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

// ไอคอนหน้าจอโฮม iPad/iPhone (180×180)
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default function AppleIcon() {
    const logo = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "clinic-logo.png")).toString("base64")}`;
    return new ImageResponse(
        (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" width={168} height={70} style={{ objectFit: "contain" }} />
            </div>
        ),
        size,
    );
}
