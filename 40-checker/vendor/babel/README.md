# Vendored @babel/parser

- Package: `@babel/parser` 8.1.0 (MIT), with `@babel/types`,
  `@babel/helper-string-parser`, `@babel/helper-validator-identifier`.
- Why: the checker needs a real AST for TypeScript/JSX as well as JS. acorn
  alone cannot parse `.ts`/`.tsx`; Babel can.
- Layout: `node_modules/@babel/*` so `@babel/parser` resolves its own deps
  without network access. `index.cjs` is the only entry the checker imports.
- Licenses: `node_modules/@babel/parser/LICENSE` and the sibling packages.
- Update: copy the four packages from a fresh `npm install @babel/parser@8.1.0`.
