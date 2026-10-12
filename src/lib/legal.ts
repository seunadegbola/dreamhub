/**
 * Details shown on the privacy policy, terms and guidelines.
 * Update `operator` with the legal name of the person or company running DreamHub
 * (UK GDPR requires the data controller to be identified).
 */
export const LEGAL = {
  product: "DreamHub",
  site: "joindreamhub.com",
  /** Legal name of the person or company running DreamHub, e.g. "Jane Smith" or "DreamHub Ltd". */
  operator: "",
  country: "the United Kingdom",
  contactEmail: "hello@joindreamhub.com",
  updated: "12 October 2026",
} as const;

/** "run by X, based in Y" — or just "based in Y" until an operator name is set. */
export const runBy = () => (LEGAL.operator ? `run by ${LEGAL.operator}, based in ${LEGAL.country}` : `based in ${LEGAL.country}`);
