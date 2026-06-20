import Image from "next/image";

export default function GonixLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
    const isFullLogo = size > 80;

    return (
        <Image
            src={isFullLogo ? "/logo-full.png" : "/logo-icon.png"}
            alt="Gonix"
            width={isFullLogo ? size : size}
            height={isFullLogo ? Math.round(size * 0.35) : size}
            className={`shrink-0 object-contain ${className}`}
            style={{ mixBlendMode: "multiply" }}
            priority
        />
    );
}
