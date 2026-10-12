import { EXTRACTION_PROMPT } from './extraction.js';
import { RISK_PROMPT } from './risk.js';

export { EXTRACTION_PROMPT, RISK_PROMPT };

/** Stored with every analysis, e.g. "extraction-v2+risk-v5". */
export const PROMPT_VERSION = `${EXTRACTION_PROMPT.version}+${RISK_PROMPT.version}`;
