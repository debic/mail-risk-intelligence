// Quick connectivity check: `npm run ping:groq -w server`
import { callGroq, LlmError } from '../src/agents/groqClient.js';

try {
  const reply = await callGroq({
    system: 'You are a connectivity check. Reply with JSON only.',
    user: 'Return exactly this JSON object: {"hello": "world"}',
  });
  console.log('Groq OK. Reply:', reply);
} catch (err) {
  if (err instanceof LlmError) {
    console.error(`Groq call failed [${err.kind}]: ${err.message}`);
  } else {
    console.error('Unexpected error:', err);
  }
  process.exitCode = 1;
}
