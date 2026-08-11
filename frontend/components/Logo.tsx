import Image from 'next/image'

interface LogoProps {
  /** Square footprint in px — the image itself keeps its own aspect ratio inside it. */
  size?: number
  className?: string
}

/**
 * The SahiCareer icon mark (running figure + road + arrow), cropped from the
 * brand logo with a transparent background — see frontend/public/logo-icon.png.
 * Works on light or colored badge backgrounds alike. Use this everywhere the
 * app previously showed a plain "S" letter badge.
 */
export default function Logo({ size = 36, className = '' }: LogoProps) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo-icon.png"
        alt="SahiCareer"
        width={734}
        height={522}
        className="w-full h-full object-contain"
        priority
      />
    </span>
  )
}
