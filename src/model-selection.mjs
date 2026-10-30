import nativeModels from './native-models.json' with { type: 'json' };
import { isNativeSelection, unsupportedModelReason } from './mode.mjs';

/** Copy host metadata and append native decision routes without mutating the shared catalog. */
export function decisionModelGroups(catalog) {
  const groups = (catalog?.groups ?? []).map(group => ({ ...group, models: group.models.map(model => ({ ...model })) }));
  for (const entry of nativeModels) {
    let group = groups.find(item => item.id === entry.provider);
    if (!group) groups.push(group = { id: entry.provider, name: entry.providerName, models: [] });
    if (!group.models.some(model => model.id === entry.model)) group.models.push({ id: entry.model, name: entry.name });
  }
  return groups.map(group => ({ ...group, models: group.models.map(model => ({ ...model,
    name: `${model.name}${unsupportedModelReason(model.id, group.id) ? ' · 不支持通用题型' : isNativeSelection({ provider: group.id, model: model.id }) ? '' : ' · 兼容模式'}`,
  })).sort((left, right) => Number(isNativeSelection({ provider: group.id, model: right.id })) - Number(isNativeSelection({ provider: group.id, model: left.id }))) }));
}

/** One model selection also retires the old switch and retains the last ordinary text model. */
export function selectionPatch(current, selected) {
  return { provider: selected.provider, model: selected.model,
    decisionApi: { ...current.decisionApi, enabled: false },
    messageModel: isNativeSelection(selected)
      ? isNativeSelection(current) || !current.provider || !current.model ? current.messageModel : { provider: current.provider, model: current.model }
      : { provider: selected.provider, model: selected.model },
  };
}
