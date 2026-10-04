import Image from "next/image"

const dimensions = {
  icon: [512, 512],
  horizontal: [1200, 320],
  vertical: [900, 780],
} as const

export function BrandLogo({
  variant = "horizontal",
  className = "",
  decorative = false,
}: {
  variant?: keyof typeof dimensions
  className?: string
  decorative?: boolean
}) {
  const [width, height] = dimensions[variant]
  return (
    <span
      className={`brand-logo brand-logo--${variant} ${className}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Open File"}
      aria-hidden={decorative || undefined}
    >
      {(["light", "dark"] as const).map((theme) => (
        <Image
          key={theme}
          className={`brand-logo__${theme}`}
          src={`/brand/open-file-${variant}-${theme}.png`}
          alt=""
          width={width}
          height={height}
          unoptimized
        />
      ))}
    </span>
  )
}
