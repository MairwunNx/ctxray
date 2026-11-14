export type Formatters = {
  number: (value: number) => string;
  compact: (value: number) => string;
  percent: (fraction: number, digits?: number) => string;
  date: (value: Date) => string;
};

export const createFormatters = (lang: string): Formatters => {
  const number = new Intl.NumberFormat(lang);
  const compact = new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  return {
    number: (value) => number.format(value),
    compact: (value) => compact.format(value),
    percent: (fraction, digits = 0) =>
      new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: digits }).format(fraction),
    date: (value) => date.format(value),
  };
};
