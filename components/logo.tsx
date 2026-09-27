// Pure HTML/CSS reproduction of the BUM. wordmark — no image assets.
// Heavy extended grotesque, chamfered "B" (clip-path), square period block.
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={className ? `brand-wordmark ${className}` : 'brand-wordmark'} role="img" aria-label="BUM.">
      <span className="brand-wordmark-b">B</span>
      <span>U</span>
      <span>M</span>
      <span className="brand-wordmark-dot" />
    </span>
  )
}
