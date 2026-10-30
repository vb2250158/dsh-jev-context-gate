import nativeModels from './native-models.json' with { type: 'json' };
import exceptions from '../docs/native-model-exceptions.json' with { type: 'json' };

const nativeIds = new Set(nativeModels.filter(model => model.protocol === 'decisions').map(model => `${model.provider}/${model.model}`));

/** Resolve the reviewed Decisions capability independently of the model's maker. The legacy mode string remains compatible. */
export function modeForModel(model, provider) {
  if (!model) return 'unconfigured';
  if (unsupportedModelReason(model, provider)) return 'unsupported';
  return nativeIds.has(`${provider}/${model}`) || /^jev(?:-|$)/i.test(model) ? 'jev-native' : 'llm-json';
}

/** Explain known incompatible protocols without treating specialized models as chat models. */
export function unsupportedModelReason(model, provider) {
  return provider === 'openrouter' ? exceptions.find(entry => entry.model === model)?.reason : undefined;
}

/** Only registered native protocols may bypass the ordinary LLM provider. */
export const isNativeSelection = settings => settings.provider === 'openrouter' && modeForModel(settings.model, settings.provider) === 'jev-native';
