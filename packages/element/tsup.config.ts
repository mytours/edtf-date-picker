import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    // tsup sets the baseUrl option, which TypeScript 6 deprecates
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    sourcemap: true,
    clean: true,
    target: 'es2022',
  },
  {
    // One file with edtf-input-core, edtf.js and edtf-humanize inlined, for a
    // single <script type="module"> from a CDN
    entry: { 'edtf-input.standalone': 'src/index.ts' },
    format: ['esm'],
    noExternal: [/.*/],
    minify: true,
    // edtf.js uses class names as node types; minifying or renaming them
    // (class Date shadows the global) breaks labels
    keepNames: true,
    sourcemap: true,
    target: 'es2022',
    platform: 'browser',
  },
])
