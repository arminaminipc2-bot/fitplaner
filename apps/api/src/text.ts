/**
 * Any number that reaches a Persian sentence on the way out of the API has to be
 * formatted here, or the reply mixes Latin digits into an otherwise Persian
 * message (rule 1).
 */
const fa = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });

export const faNumber = (value: number): string => fa.format(value);
