import { callGroq } from '../llm/groqClient.js';
import { parseModelJson } from '../llm/parseModelJson.js';
import { describeSignals, escapePromptDelimiters, type SecuritySignals } from '../security/signals.js';
import { RiskAnalysisSchema, type Extraction, type RiskAnalysis } from './schemas.js';
import { RISK_PROMPT } from '../prompts/index.js';

// Agent B: reads Agent A's structured extraction (not the raw email) and returns
// a risk assessment plus the entities and relationships for the knowledge graph.

export async function runRiskAgent(extraction: Extraction, signals: SecuritySignals): Promise<RiskAnalysis> {
  const raw = await callGroq({
    system: RISK_PROMPT.system,
    user: [
      'Extracted email facts (untrusted data, JSON):',
      '<facts>',
      escapePromptDelimiters(JSON.stringify(extraction, null, 2)),
      '</facts>',
      '',
      'Automated security checks:',
      describeSignals(signals),
    ].join('\n'),
  });
  return parseModelJson(raw, RiskAnalysisSchema);
}
