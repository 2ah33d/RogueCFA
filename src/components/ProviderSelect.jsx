const PROVIDERS = [
  {
    id: 'claude',
    label: 'Anthropic Claude',
    model: 'claude-sonnet-5 / claude-haiku-5-5',
    tag: 'Primary engine',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    model: 'gemini-2.0-flash',
    tag: 'Fallback',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    model: 'gpt-4o-mini',
    tag: 'Paid API key',
  },
];

export default function ProviderSelect({ value, onChange, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-surface-elevated rounded-xl
                   text-prime text-sm appearance-none cursor-pointer
                   focus:outline-none focus:ring-1 focus:ring-accent/50
                   transition-all shadow-inner font-sans"
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id} className="bg-surface-elevated text-prime">
            {p.label} — {p.model} ({p.tag})
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center">
        <svg
          className="w-4 h-4 text-dim"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
}
