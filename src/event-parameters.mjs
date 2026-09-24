/** Event and parameter identifiers remain stable; display text is presentation data. */
export const EVENT_DEFINITIONS = Object.freeze([
  { key: 'before', display: '用户发送消息', parameters: [] },
  { key: 'skill-catalog', display: 'Skill 目录准备注入', parameters: [
    { key: 'skills', display: '当前可用 Skill', kind: 'options' },
  ] },
  { key: 'skill-injection', display: 'Skill 正文准备注入', parameters: [] },
  { key: 'after', display: '工具返回结果', parameters: [] },
]);

/** List option-bearing parameters declared for an event. */
export function optionParametersForEvent(eventKey) {
  return EVENT_DEFINITIONS.find(event => event.key === eventKey)?.parameters.filter(parameter => parameter.kind === 'options') ?? [];
}
