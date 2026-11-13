type ArabicForms = {
  zero: string;
  one: string;
  two: string;
  few: string;
  many: string;
};

export function arabicPlural(n: number, f: ArabicForms): string {
  if (n === 0) return f.zero;
  if (n === 1) return `${n} ${f.one}`;
  if (n === 2) return `${n} ${f.two}`;
  if (n >= 3 && n <= 10) return `${n} ${f.few}`;
  return `${n} ${f.many}`;
}
