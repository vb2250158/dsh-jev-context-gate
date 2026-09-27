/** Runtime extension points. Event keys and adapter keys are stable identifiers; labels are presentation data. */
export function createCapabilityRegistry() {
  const events = new Map();
  const adapters = new Map();

  const register = (registry, definition, handler) => {
    if (!definition || !/^[a-z][a-z0-9.-]*$/.test(definition.key) || !definition.display?.trim() || typeof handler !== 'function')
      throw new TypeError('Invalid Jev capability');
    if (registry.has(definition.key)) throw new Error(`Jev capability ${definition.key} is already registered`);
    const entry = { definition: structuredClone(definition), handler };
    registry.set(definition.key, entry);
    return () => { if (registry.get(definition.key) === entry) registry.delete(definition.key); };
  };

  return {
    registerEvent: definition => register(events, definition, () => {}),
    registerAdapter: (definition, handler) => register(adapters, definition, handler),
    events: () => [...events.values()].map(entry => structuredClone(entry.definition)),
    adapters: () => [...adapters.values()].map(entry => structuredClone(entry.definition)),
    event: key => events.get(key)?.handler,
    adapter: key => adapters.get(key)?.handler,
  };
}

/** Read a named action parameter without using its localized display label as an identifier. */
export function actionParameter(action, key, fallback = '') {
  return action.params?.find(parameter => parameter.key === key)?.value ?? fallback;
}
