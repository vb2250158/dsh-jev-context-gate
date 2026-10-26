/** The model ID selects the Jev protocol; legacy nativeJev settings are ignored. */
export function modeForModel(model, decisionApi) {
  if (decisionApi?.enabled) return 'jev-native';
  if (!model) return 'unconfigured';
  return /^jev(?:-|$)/i.test(model) ? 'jev-native' : 'llm-json';
}
