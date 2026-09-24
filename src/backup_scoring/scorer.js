/**
 * Send the constructed prompt to the LLM via the Vercel proxy.
 * Returns the merged scorecard (math score + LLM narrative).
 *
 * Flexible signature support:
 * 1. scoreWithLLM(provider, llmKey, systemPrompt, userPrompt, mathScore)
 * 2. scoreWithLLM(systemPrompt, userPrompt, llmKey, provider, mathScore)
 * 3. scoreWithLLM({ provider, llmKey, systemPrompt, userPrompt, mathScore })
 */
export async function scoreWithLLM(arg1, arg2, arg3, arg4, arg5) {
  let provider, llmKey, systemPrompt, userPrompt, mathScore;

  if (typeof arg1 === 'object' && arg1 !== null) {
    ({ provider, llmKey, systemPrompt, userPrompt, mathScore } = arg1);
  } else if (
    typeof arg1 === 'string' &&
    ['gemini', 'openai', 'claude', 'groq'].includes(arg1.toLowerCase())
  ) {
    provider = arg1;
    llmKey = arg2;
    systemPrompt = arg3;
    userPrompt = arg4;
    mathScore = arg5;
  } else {
    systemPrompt = arg1;
    userPrompt = arg2;
    llmKey = arg3;
    provider = arg4;
    mathScore = arg5;
  }

  const response = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmKey,
      provider,
      systemPrompt,
      userPrompt,
      mathScore,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Scoring failed (${response.status})`);
  }

  const data = await response.json();
  return data.result;
}
