import nativeModels from './native-models.json' with { type: 'json' };
import { isNativeSelection } from './mode.mjs';

/** Merge supported native models into the ordinary picker, preserving catalog order within each kind. */
export function modelChoices(catalog) {
  const rows = catalog?.groups.flatMap(group => group.models.map(model => ({
    provider: group.id, model: model.id, label: `${group.name} · ${model.name}`,
  }))) ?? [];
  for (const entry of nativeModels) if (!rows.some(row => row.provider === entry.provider && row.model === entry.model)) {
    rows.push({ provider: entry.provider, model: entry.model, label: `${entry.providerName} · ${entry.name}` });
  }
  return rows.map(row => ({ ...row, id: JSON.stringify([row.provider, row.model]), native: isNativeSelection(row),
    label: `${row.label}${isNativeSelection(row) ? '' : ' · 兼容模式'}`,
  })).sort((left, right) => Number(right.native) - Number(left.native));
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
