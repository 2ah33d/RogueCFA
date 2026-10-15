/**
 * Token Pricing Utility — Exact LLM API cost calculations per provider.
 * Rates based on current official API pricing ($ per 1M tokens):
 * - Claude Haiku 5.5: $0.50 / 1M input, $2.50 / 1M output (~$0.00347/digest)
 * - Claude Sonnet 5: $1.00 / 1M input, $5.00 / 1M output (~$0.00695/score)
 * - Groq (Llama 3.3 70B): $0.59 / 1M input, $0.79 / 1M output (~$0.00319/digest)
 * - Gemini 1.5 Flash: $0.075 / 1M input, $0.30 / 1M output (~$0.00049/digest)
 * - OpenAI (GPT-4o-mini): $0.15 / 1M input, $0.60 / 1M output (~$0.00098/digest)
 */

export const PROVIDER_RATES = {
  claude: {
    name: 'Claude Haiku 5.5',
    inputPerM: 0.50,
    outputPerM: 2.50,
  },
  claudeHaiku: {
    name: 'Claude Haiku 5.5',
    inputPerM: 0.50,
    outputPerM: 2.50,
  },
  claudeSonnet: {
    name: 'Claude Sonnet 5',
    inputPerM: 1.00,
    outputPerM: 5.00,
  },
  claudeOpus: {
    name: 'Claude Opus 5',
    inputPerM: 2.50,
    outputPerM: 12.50,
  },
  claudeFable: {
    name: 'Claude Fable 5',
    inputPerM: 5.00,
    outputPerM: 25.00,
  },
  groq: {
    name: 'Groq (Llama 3.3 70B)',
    inputPerM: 0.59,
    outputPerM: 0.79,
  },
  gemini: {
    name: 'Gemini 1.5 Flash',
    inputPerM: 0.075,
    outputPerM: 0.30,
  },
  openai: {
    name: 'GPT-4o mini',
    inputPerM: 0.15,
    outputPerM: 0.60,
  },
};

/**
 * Calculates exact digest generation cost based on LLM provider rates.
 */
export function calculateDigestCost(providerKey = 'claude', inputTokens = 4850, outputTokens = 420) {
  const key = (providerKey || 'claude').toLowerCase();
  const rates = PROVIDER_RATES[key] || PROVIDER_RATES.claude;

  const inputCost = (inputTokens / 1000000) * rates.inputPerM;
  const outputCost = (outputTokens / 1000000) * rates.outputPerM;
  const total = inputCost + outputCost;

  let formattedCost;
  if (total < 0.001) {
    formattedCost = `$${total.toFixed(5)}`;
  } else if (total < 0.01) {
    formattedCost = `$${total.toFixed(4)}`;
  } else {
    formattedCost = `$${total.toFixed(4)}`;
  }

  return {
    total,
    formattedCost,
    providerName: rates.name,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
  };
}
