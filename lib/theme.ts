/**
 * Language Games — Apple-Inspired Metallic Theme
 *
 * Modeled after the consistent edge language Apple uses across
 * AirPods, MacBooks, iPhones — smooth continuous corners (squircles),
 * a deep metallic blue/silver palette, and clean typographic hierarchy.
 *
 * Think: the gunmetal finish on a MacBook Pro meets the
 * Space Black titanium of an iPhone, with subtle blue luminosity.
 */

export const colors = {
  // ── Backgrounds (darkest to lightest) ──────────────────────
  bg: {
    primary: '#0B0F1A',      // Near-black with a cool blue undertone — main canvas
    secondary: '#111827',     // Dark metallic blue — card surfaces
    tertiary: '#1C2640',      // Elevated surfaces, modals
    elevated: '#1E293B',      // Highest elevation — sheets, popovers
  },

  // ── Metallic Blue Accents ──────────────────────────────────
  blue: {
    dark: '#1E3A5F',          // Dark metallic blue — borders, dividers
    mid: '#2563EB',           // Primary action blue
    bright: '#3B82F6',        // Buttons, links, interactive elements
    light: '#60A5FA',         // Highlights, active states
    pale: '#93C5FD',          // Subtle blue tints, badges
    wash: '#BFDBFE',          // Very light blue — rare, for emphasis text
  },

  // ── Metallic Silver / Grey ─────────────────────────────────
  silver: {
    dark: '#374151',          // Dark metallic silver — borders, muted elements
    mid: '#6B7280',           // Secondary text, placeholders
    light: '#9CA3AF',         // Tertiary text, captions
    bright: '#D1D5DB',        // Light metallic silver — secondary labels
    pale: '#E5E7EB',          // Very light silver — primary text on dark
    white: '#F1F5F9',         // Near-white with cool tint — headlines
  },

  // ── Semantic Colors ────────────────────────────────────────
  success: '#34D399',         // Emerald green — correct answers
  error: '#F87171',           // Soft red — wrong answers, destructive
  warning: '#FBBF24',         // Amber — wager mode, caution
  info: '#60A5FA',            // Light blue — informational

  // ── Surface Effects ────────────────────────────────────────
  glass: 'rgba(28, 38, 64, 0.65)',       // Frosted glass card
  glassBorder: 'rgba(148, 163, 184, 0.10)', // Subtle silver edge
  divider: 'rgba(148, 163, 184, 0.08)',  // Hairline dividers
  overlay: 'rgba(0, 0, 0, 0.5)',         // Modal overlays
} as const;

// ── Border Radii (Apple squircle proportions) ────────────────
export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,       // Standard cards — like iPhone app icons
  xl: 20,       // Large cards, modals
  xxl: 24,      // Hero cards
  full: 9999,   // Circular
} as const;

// ── Spacing (8pt grid) ───────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ── Typography ───────────────────────────────────────────────
export const type = {
  hero: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5, color: colors.silver.white },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.silver.white },
  headline: { fontSize: 17, fontWeight: '600' as const, color: colors.silver.white },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.silver.bright },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.silver.light },
  footnote: { fontSize: 11, fontWeight: '400' as const, color: colors.silver.mid },
  label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.silver.mid },
} as const;

// ── Card Styles (reusable surface) ───────────────────────────
export const card = {
  backgroundColor: colors.bg.secondary,
  borderRadius: radii.lg,
  borderWidth: 1,
  borderColor: colors.glassBorder,
} as const;

export const cardElevated = {
  backgroundColor: colors.bg.tertiary,
  borderRadius: radii.lg,
  borderWidth: 1,
  borderColor: colors.glassBorder,
} as const;

// ── Button Presets ───────────────────────────────────────────
export const button = {
  primary: {
    backgroundColor: colors.blue.bright,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center' as const,
  },
  secondary: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center' as const,
  },
} as const;

export const buttonText = {
  primary: { fontSize: 17, fontWeight: '600' as const, color: '#FFFFFF' },
  secondary: { fontSize: 17, fontWeight: '600' as const, color: colors.silver.bright },
  ghost: { fontSize: 15, fontWeight: '500' as const, color: colors.blue.light },
} as const;

// ── Input Preset ─────────────────────────────────────────────
export const input = {
  backgroundColor: colors.bg.secondary,
  borderRadius: radii.md,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  paddingVertical: 16,
  paddingHorizontal: 16,
  fontSize: 17,
  color: colors.silver.white,
} as const;
