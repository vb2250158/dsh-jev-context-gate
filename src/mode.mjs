/** The model ID selects the Jev protocol; legacy nativeJev settings are ignored. */
export function modeForModel(model, provider) {
  if (!model) return 'unconfigured';
  return provider === 'openrouter' && /^typesafe\/jev-[A-Za-z0-9.-]+$/.test(model) || /^jev(?:-|$)/i.test(model) ? 'jev-native' : 'llm-json';
}

/** Only registered native protocols may bypass the ordinary LLM provider. */
export const isNativeSelection = settings => settings.provider === 'openrouter' && modeForModel(settings.model, settings.provider) === 'jev-native';
