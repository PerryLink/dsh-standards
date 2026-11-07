// A bundle that inlines a declared dependency the way esbuild/rolldown does.
// The schemastery parser compiles a *declared callback string*, not a payload.
//#region node_modules/.pnpm/@deepseek-ai+schemastery@3.19.0/node_modules/@deepseek-ai/schemastery/lib/index.js
const kSchema = Symbol.for("schemastery")

export function apply(schema) {
  if (typeof schema.callback === "string") {
    schema.callback = new Function("return " + schema.callback)()
  }
  return { schema, kSchema }
}
//#endregion

export function register(ctx) {
  ctx?.plugin?.(apply)
}
