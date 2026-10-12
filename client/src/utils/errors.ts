import type { AnalysisError } from '../../../shared/types'

/** Plain-language explanation of a failed analysis, for analysts rather than developers. */
export function describeAnalysisError(error: AnalysisError): string {
  const stage = error.stage === 'extraction' ? 'reading the email' : 'assessing its risk'
  switch (error.kind) {
    case 'no_key':
      return 'The AI service is not configured. Add a GROQ_API_KEY to the .env file, restart the server and retry.'
    case 'timeout':
      return `The AI service took too long while ${stage}. Please retry.`
    case 'network':
      return `The AI service could not be reached while ${stage}. Check the connection and retry.`
    case 'bad_json':
    case 'invalid_output':
    case 'empty':
      return `The AI returned an unexpected response while ${stage}. Retrying usually fixes this.`
    case 'http':
      if (error.message.includes('HTTP 429')) return 'The AI service rate limit was reached. Wait a minute and retry.'
      if (error.message.includes('HTTP 401')) return 'The AI service rejected the API key. Check GROQ_API_KEY in .env.'
      return `The AI service returned an error while ${stage}. Please retry.`
    default:
      return `Something went wrong while ${stage}. Please retry.`
  }
}
