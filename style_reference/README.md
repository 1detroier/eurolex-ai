# Factorial Design System — Style Reference

Source: https://github.com/factorialco/f0/tree/main/packages/core

## Key Design Principles

- **Color model**: HSL (`H S% L%`) with opacity variants
- **Neutral scale**: Grey-based, 0 (lightest) to 100 (darkest)
- **Accent color**: Radical (pink-red `348 80% 50%`)
- **Border radius**: Default `0.625rem` (10px), rounded but not pill-shaped
- **Spacing**: Pixel-first scale (4px base unit)
- **Breakpoints**: md=900px, lg=1200px, xl=1440px

## Color Semantic Mapping

| Purpose    | Light Mode        | Notes                    |
|------------|-------------------|--------------------------|
| Background | neutral-0 (white) | Clean white base         |
| Foreground | neutral-100       | Dark grey text           |
| Accent     | radical-50        | Pink-red, primary action |
| Border     | neutral-30        | Subtle grey borders      |
| Critical   | red-50            | Errors, destructive      |
| Positive   | grass-50          | Success states           |
| Warning    | orange-50         | Warning states           |
| Info       | malibu-50         | Info states              |
| Selected   | viridian-50       | Selection, active state  |

## Files

- `factorial-tokens.css` — CSS variables ready to paste into globals.css
- `factorial-colors.ts` — Full color palette reference
- `factorial-theme.css` — Complete theme with light/dark mode
