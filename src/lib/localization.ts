export function toPersianDigits(num: number | string): string {
  const str = String(num);
  const persianDigits: Record<string, string> = {
    '0': '۰',
    '1': '۱',
    '2': '۲',
    '3': '۳',
    '4': '۴',
    '5': '۵',
    '6': '۶',
    '7': '۷',
    '8': '۸',
    '9': '۹',
  };
  return str.replace(/\d/g, (d) => persianDigits[d]);
}
