import { actionParameter } from './capability-registry.mjs';
import { sendGroupMessage, startGroupPolling, deliveryIdFor, rabiTimeSeconds } from './tool-automation.mjs';

/** A generic installed-tool adapter keeps channel and target parameters in rule data. */
export async function dispatchToTool({ ctx, agent, action, message, signal, internalCalls, eventId, ruleId }) {
  const toolName = actionParameter(action, 'toolName');
  const messageArgument = actionParameter(action, 'messageArgument', 'text');
  const idempotencyArgument = actionParameter(action, 'idempotencyArgument');
  if (!toolName || !ctx.tools.schemas().some(tool => tool.name === toolName)) throw new Error(`Configured action tool ${toolName || '(empty)'} is unavailable`);
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(messageArgument)) throw new TypeError('Invalid message argument');
  if (idempotencyArgument && (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(idempotencyArgument) || idempotencyArgument === messageArgument || !eventId || !ruleId))
    throw new TypeError('Invalid idempotency argument or event identity');
  const args = {};
  for (const parameter of action.params ?? []) {
    if (!parameter.key.startsWith('arg.')) continue;
    const key = parameter.key.slice(4);
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) throw new TypeError('Invalid tool argument key');
    args[key] = parameter.value;
  }
  args[messageArgument] = message;
  if (idempotencyArgument) args[idempotencyArgument] = deliveryIdFor(agent.session.id, eventId, ruleId);
  const callId = crypto.randomUUID();
  internalCalls.add(callId);
  try {
    const result = await ctx.tools.execute({ callId, name: toolName, arguments: args, agent, signal });
    if (result?.isError || result?.value?.ok === false) throw new Error(result?.value?.error?.message || `Action tool ${toolName} failed`);
    return result;
  } finally { internalCalls.delete(callId); }
}

/** Rabi is one replaceable delivery adapter; channel and destination come from the selected option. */
export async function dispatchToRabi({ ctx, agent, action, message, signal, internalCalls, eventId, ruleId, settings, logger, onDone, createMessage, pollSignal }) {
  const required = ['routeId', 'channel', 'target', 'targetId'];
  if (required.some(key => !actionParameter(action, key))) throw new TypeError('Rabi delivery action is missing destination parameters');
  if (!ctx.tools.schemas().some(tool => tool.name === 'rabiroute_agent_send')) throw new Error('Rabi delivery tool is not installed');
  const channelParams = Object.fromEntries((action.params ?? []).filter(parameter => parameter.key.startsWith('channel.')).map(parameter => [parameter.key.slice(8), parameter.value]));
  const rule = {
    groupRouteId: actionParameter(action, 'routeId'), groupId: actionParameter(action, 'targetId'), groupRoleId: actionParameter(action, 'roleId'),
    channel: actionParameter(action, 'channel'), target: actionParameter(action, 'target'), targetId: actionParameter(action, 'targetId'),
    targetIdKey: actionParameter(action, 'targetIdKey'), historyAdapter: actionParameter(action, 'historyAdapter'),
    historyKind: actionParameter(action, 'historyKind'), historyTarget: actionParameter(action, 'historyTarget'), channelParams,
    pollMinutes: Number(actionParameter(action, 'pollMinutes', '10')), maxPolls: Number(actionParameter(action, 'maxPolls', '432')),
    threshold: Number(actionParameter(action, 'replyThreshold', '0.8')),
    replyQuestion: actionParameter(action, 'replyQuestion', '这条消息是否直接回答了先前的问题？'),
    replyYes: actionParameter(action, 'replyYes', '回答了问题'), replyNo: actionParameter(action, 'replyNo', '未回答或不相关'),
  };
  const waiting = actionParameter(action, 'waitForReply') === 'true';
  if (waiting && (!rule.groupRoleId || !Number.isSafeInteger(rule.pollMinutes) || rule.pollMinutes < 1 || !Number.isSafeInteger(rule.maxPolls) || rule.maxPolls < 1))
    throw new TypeError('Rabi reply wait requires a role and valid poll settings');
  const sentAt = rabiTimeSeconds(Date.now());
  const receipt = await sendGroupMessage({ ctx, agent, rule, message, deliveryId: deliveryIdFor(agent.session.id, eventId, ruleId), signal, internalCalls });
  if (waiting) startGroupPolling({ ctx, agent, rule, sentAt, sentMessageId: receipt.sentMessageId, questionText: message, settings,
    signal: pollSignal, logger, internalCalls, onDone, createMessage });
  return receipt;
}
