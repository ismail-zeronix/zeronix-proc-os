/** Amounts in words for invoices and receipts: "UAE Dirhams Two Thousand Six Hundred Twenty-Five and Fifty Fils Only". */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion"];

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

export function wholeInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const groups: string[] = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g) groups.unshift(`${underThousand(g)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  return groups.join(" ");
}

export function aedInWords(amount: number): string {
  const fils = Math.round(Math.abs(amount) * 100);
  const dirhams = Math.floor(fils / 100);
  const rest = fils % 100;
  return `UAE Dirhams ${wholeInWords(dirhams)}${rest ? ` and ${wholeInWords(rest)} Fils` : ""} Only`;
}
