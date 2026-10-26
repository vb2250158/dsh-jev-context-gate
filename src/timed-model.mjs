/** Attach operation labels through the optional statistics plugin without changing model options. */
export function createTimedModelStream(ctx) {
  return (options, operation) => {
    const timing = ctx.get('chatStageTiming');
    return timing === undefined ? ctx.llm.stream(options)
      : timing.stream({ plugin: 'dsh-jev-context-gate', ...operation }, () => ctx.llm.stream(options));
  };
}
