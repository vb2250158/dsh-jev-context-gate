/** The model ID selects the Jev protocol; legacy nativeJev settings are ignored. */
export function modeForModel(model) {
  if (!model) return 'unconfigured';
  return /^jev(?:-|$)/i.test(model) ? 'jev-native' : 'llm-json';
}
