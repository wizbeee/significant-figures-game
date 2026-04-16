// AI 멀티프로바이더 서비스
// Claude, GPT, Gemini 지원

const PROVIDERS = {
  claude: {
    name: 'Claude',
    url: 'https://api.anthropic.com/v1/messages',
    buildRequest: (apiKey, model, messages, systemPrompt) => ({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      }
    }),
    parseResponse: (data) => data.content?.[0]?.text || ''
  },
  openai: {
    name: 'GPT',
    url: 'https://api.openai.com/v1/chat/completions',
    buildRequest: (apiKey, model, messages, systemPrompt) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: {
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ],
        temperature: 0.7,
        max_tokens: 4096
      }
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || ''
  },
  gemini: {
    name: 'Gemini',
    buildRequest: (apiKey, model, messages, systemPrompt) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
      }
    }),
    parseResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }
};

export async function callAI({ provider, apiKey, model, messages, systemPrompt }) {
  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) throw new Error(`지원하지 않는 AI 프로바이더: ${provider}`);
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하세요.');

  const request = providerConfig.buildRequest(apiKey, model, messages, systemPrompt);

  // Electron IPC 프록시로 요청 (CORS 우회)
  if (window.electronAPI) {
    const result = await window.electronAPI.ai.call(request);
    if (!result.ok) {
      throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
    }
    return providerConfig.parseResponse(result.data);
  }

  // 브라우저 직접 호출 (개발용)
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body)
  });
  if (!response.ok) {
    throw new Error(`AI API 오류: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return providerConfig.parseResponse(data);
}

export function getProviderModels(provider) {
  const models = {
    claude: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' }
    ],
    openai: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }
    ],
    gemini: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash' }
    ]
  };
  return models[provider] || [];
}
