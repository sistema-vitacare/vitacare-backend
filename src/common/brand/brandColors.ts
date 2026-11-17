/**
 * Paleta unica do VitaCare, copiada de `vitacare-frontend/src/styles/theme.js`
 * (o frontend prevalece). Usada pelo PDF dos relatorios gerenciais (BE-30) e
 * pelo layout dos e-mails. `accent` e so decoracao: em fundo branco o contraste
 * nao serve para texto, que usa `teal`.
 */
export const BRAND_COLORS = {
  navy: '#183058',
  teal: '#0D7D77',
  tealDark: '#0B6B66',
  tealLight: '#E7F4F3',
  accent: '#00B69B',
  muted: '#5B6B82',
  onNavyMuted: '#C5D3E8',
  white: '#FFFFFF',
  surface: '#F3F5F7',
  divider: '#E6E9EE',
  critical: '#B42318',
  criticalTint: '#FEF3F2',
  warning: '#B54708',
  warningTint: '#FFFAEB',
  info: '#175CD3',
  infoTint: '#EFF8FF',
  success: '#067647',
  successTint: '#ECFDF3',
} as const;
