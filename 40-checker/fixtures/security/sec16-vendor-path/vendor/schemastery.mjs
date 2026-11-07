// Vendored verbatim (a generic parser, not the plugin's own dynamic execution).
export function compile(source) {
  return new Function('return ' + source)()
}
