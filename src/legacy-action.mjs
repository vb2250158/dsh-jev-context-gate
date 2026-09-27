/** Convert previously saved Rabi-specific options into ordinary adapter actions. */
export function normalizeAction(action, rule) {
  if (action.type !== 'notify-group' && action.type !== 'ask-group') return { ...action, params: action.params ?? [] };
  const waiting = action.type === 'ask-group';
  const values = {
    adapter: 'rabi', routeId: rule.groupRouteId ?? '', channel: 'napcat', target: 'group', targetId: rule.groupId ?? '',
    roleId: rule.groupRoleId ?? '', waitForReply: String(waiting), pollMinutes: String(rule.pollMinutes ?? 10),
    maxPolls: String(rule.maxPolls ?? 432), replyThreshold: String(rule.threshold ?? 0.8),
  };
  return { type: 'dispatch', text: action.text, params: Object.entries(values).map(([key, value]) => ({ key, display: '', value })) };
}
