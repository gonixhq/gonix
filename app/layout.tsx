import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai, Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800"],
    variable: "--font-montserrat",
    display: "swap",
});

const notoSansThai = Noto_Sans_Thai({
    subsets: ["thai", "latin"],
    weight: ["300", "400", "500", "600", "700"],
    variable: "--font-thai",
    display: "swap",
});

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    themeColor: "#0b1f3a",
};

export const metadata: Metadata = {
    title: {
        default: "Gonix Clinic OS",
        template: "%s | Gonix",
    },
    description:
        "Enterprise-grade Clinic Operating System — multi-branch, PDPA-compliant, built for modern healthcare.",
    robots: {
        index: false,
    },
    // iPad/iPhone: เพิ่มไปยังหน้าจอโฮม → เปิดเต็มจอเหมือนแอป
    appleWebApp: { capable: true, title: "Gonix", statusBarStyle: "black" },
    // ไม่ให้ iOS แปลงตัวเลข (HN / VN / เบอร์) เป็นลิงก์โทรอัตโนมัติ
    formatDetection: { telephone: false, email: false, address: false },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="th" suppressHydrationWarning>
            <body className={`${montserrat.variable} ${notoSansThai.variable} font-sans`} suppressHydrationWarning>{children}</body>
        </html>
    );
}
