/**
 * Fitna AI logo lockup.
 *
 * variant="dark"  -> dark navy wordmark (public/logo/logo-dark.png),
 *                    for use on light backgrounds (beige/white headers,
 *                    landing page).
 * variant="light" -> white wordmark (public/logo/logo-light.png), for
 *                    use on dark backgrounds (Live Simulation screen,
 *                    footer, dark sections).
 *
 * Both files are the real uploaded lockups, cropped to their actual
 * content bounding box with a small consistent padding so they render
 * at matching visual weight despite slightly different source export
 * dimensions (2048×1152 vs 1881×836 originally).
 *
 * Per spec 6.1: don't hardcode one variant everywhere — pass the
 * correct variant explicitly based on the surrounding
 * section/background, e.g.:
 *   <Logo variant="dark" />   // on the beige landing header
 *   <Logo variant="light" />  // inside the navy Live Simulation bar
 */

type LogoProps = {
  variant: "dark" | "light";
  className?: string;
  height?: number;
};

export function Logo({ variant, className = "", height = 48 }: LogoProps) {
  const src = variant === "light" ? "/logo/logo-light.png" : "/logo/logo-dark.png";
  return (
    <img
      src={src}
      alt="Fitna AI"
      height={height}
      className={className}
      style={{ height: height + 'px', width: 'auto', objectFit: 'contain' }}
    />
  );
}
