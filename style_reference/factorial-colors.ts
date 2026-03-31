/*
 * Factorial F0 — Color Palette Reference
 * All values in HSL format (H S% L%)
 *
 * Factorial uses a "radical" (pink-red) as primary accent.
 * For EuroLex AI, we could use "malibu" (blue) instead for a more legal/professional feel.
 */

export const factorialColors = {
  // Primary accent — Factorial uses radical (pink-red)
  // For legal app, consider malibu (blue) or viridian (teal) instead
  accent: {
    radical: { 50: "348 80% 50%", 60: "348 80% 42%", 70: "347 80% 34%" },
    malibu:  { 50: "216 90% 65%", 60: "216 59% 55%", 70: "216 48% 44%" }, // Blue
    viridian:{ 50: "184 92% 35%", 60: "184 92% 28%", 70: "184 92% 24%" }, // Teal
    indigo:  { 50: "239 91% 64%", 60: "239 59% 54%", 70: "239 51% 44%" }, // Purple-blue
  },

  // Neutral scale
  neutral: {
    0:   "0 0% 100%",           // White background
    5:   "220 88% 17% / 0.04",  // Hover background
    10:  "216 89% 18% / 0.06",  // Secondary bg
    20:  "214 70% 20% / 0.1",   // Border
    30:  "213 87% 15% / 0.20",  // Border hover
    40:  "219 97% 15% / 0.45",  // Muted text
    50:  "217 96% 11% / 0.61",  // Secondary text
    60:  "220 88% 10% / 0.82",
    70:  "219 91% 8% / 0.88",
    80:  "219 94% 7% / 0.9",
    90:  "219 88% 6% / 0.92",
    100: "218 48% 10%",         // Dark text
  },

  // Semantic
  critical: { 50: "5 100% 65%", 60: "4 61% 49%", 70: "3 71% 41%" },
  warning:  { 50: "25 95% 53%", 60: "24 69% 49%", 70: "24 69% 40%" },
  positive: { 50: "160 84% 39%", 60: "160 85% 33%", 70: "161 84% 27%" },
  info:     { 50: "216 90% 65%", 60: "216 59% 55%", 70: "216 48% 44%" },

  // Border radius
  borderRadius: {
    none: "0px",
    "2xs": "0.25rem",   // 4px
    xs: "0.375rem",     // 6px
    sm: "0.5rem",       // 8px
    DEFAULT: "0.625rem", // 10px — Factorial's default
    md: "0.75rem",      // 12px
    lg: "0.875rem",     // 14px
    xl: "1rem",         // 16px
    "2xl": "1.5rem",    // 24px
    full: "9999px",
  },

  // Spacing (4px base unit)
  spacing: {
    1: "4px", 2: "8px", 3: "12px", 4: "16px",
    5: "20px", 6: "24px", 8: "32px", 10: "40px",
    12: "48px", 16: "64px", 20: "80px",
  },

  // Breakpoints
  breakpoints: {
    md: 900,
    lg: 1200,
    xl: 1440,
  },
} as const;
