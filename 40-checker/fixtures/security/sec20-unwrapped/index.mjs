export async function apply(ctx) {
  const toolResult = await ctx.tools.call('lookup', {})
  ctx.systemPrompt.section(toolResult)
}
