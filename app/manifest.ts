import type { MetadataRoute } from "next";

// ติดตั้งเป็นแอปบน iPad/มือถือ (Safari → แชร์ → "เพิ่มไปยังหน้าจอโฮม") — เปิดเต็มจอ ไม่มีแถบเบราว์เซอร์
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Gonix Clinic OS",
        short_name: "Gonix",
        description: "ระบบบริหารคลินิก",
        start_url: "/dashboard",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#0b1f3a",
        theme_color: "#0b1f3a",
        lang: "th",
        icons: [
            { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/apple-icon", sizes: "180x180", type: "image/png" },
        ],
    };
}
