/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

// CSP — อนุญาต LIFF SDK (static.line-scdn.net), Supabase (REST+realtime), LINE API
// เริ่มแบบ Report-Only ก่อน: ไม่บล็อกอะไร แค่ log violation ใน console
// พอยืนยันว่า dashboard/LIFF/GPS/กล้อง ไม่มี violation → เปลี่ยนเป็น Content-Security-Policy (บังคับใช้)
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.line-scdn.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.line-scdn.net",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.line.me https://static.line-scdn.net",
  "frame-src 'self' https://*.line.me",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy-Report-Only', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },                     // clickjacking (/print, /result ด้วย)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // เปิด GPS + กล้อง เฉพาะ self (check-in/ถ่ายรูปยังทำงาน) ปิดที่เหลือ
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pgppckmbbqvlvliqgdrq.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
}

export default nextConfig
