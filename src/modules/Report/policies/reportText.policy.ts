import type { FollowUpAnswerDto } from '@/modules/FollowUp/dtos/followUp.dto';
import type {
  MedicationDoseUnit,
  MedicationRoute,
} from '@/modules/Medication/types/medication.types';

const TIME_ZONE = 'America/Sao_Paulo';

/** Extras do cp1252 que a fonte padrao do PDF (WinAnsi) imprime alem do Latin-1. */
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

const isWinAnsi = (char: string): boolean => {
  const code = char.codePointAt(0)!;

  return (
    char === '\n' ||
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    WIN_ANSI_EXTRAS.has(char)
  );
};

/** O PDF usa Helvetica sem embutir fonte: o resto do Unicode vira `?`. */
export const toPdfText = (text: string): string =>
  Array.from(text, (char) => (isWinAnsi(char) ? char : '?')).join('');

const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export const formatNumber = (value: number): string => NUMBER.format(value);

/** `AAAA-MM-DD` -> `DD/MM/AAAA`, sem conversao de fuso. */
export const formatDay = (day: string): string =>
  day.split('-').reverse().join('/');

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Instante ISO -> `DD/MM/AAAA HH:mm` no fuso de Sao Paulo. */
export const formatDateTime = (iso: string): string =>
  DATE_TIME.format(new Date(iso)).replace(',', '');

export const formatAnswer = (
  answer: Pick<FollowUpAnswerDto, 'fieldType' | 'unit' | 'value'>,
): string => {
  const { value } = answer;

  if (typeof value === 'number') {
    return answer.unit
      ? `${formatNumber(value)} ${answer.unit}`
      : formatNumber(value);
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.join(', ');

  return value;
};

export const DOSE_UNIT_LABELS: Readonly<Record<string, string>> = {
  mg: 'mg',
  mcg: 'mcg',
  g: 'g',
  ml: 'mL',
  iu: 'UI',
  drops: 'gota(s)',
  tablet: 'comprimido(s)',
  capsule: 'cápsula(s)',
  application: 'aplicação(ões)',
} satisfies Record<MedicationDoseUnit, string>;

export const ROUTE_LABELS: Readonly<Record<string, string>> = {
  oral: 'oral',
  sublingual: 'sublingual',
  topical: 'tópica',
  transdermal: 'transdérmica',
  inhalation: 'inalatória',
  nasal: 'nasal',
  ophthalmic: 'oftálmica',
  otic: 'otológica',
  rectal: 'retal',
  vaginal: 'vaginal',
  subcutaneous: 'subcutânea',
  intramuscular: 'intramuscular',
  intravenous: 'intravenosa',
  other: 'outra',
} satisfies Record<MedicationRoute, string>;
