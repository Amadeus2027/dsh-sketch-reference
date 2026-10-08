import type { UserConfig } from 'tsdown'
import { createClientBundle } from './build/client-bundle.ts'

const host: UserConfig = {
  name: 'dsh-sketch-reference',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  dts: false,
  sourcemap: false,
  clean: false,
  external: [/^@deepseek-ai\//],
  outputOptions: {
    entryFileNames: '[name].js',
  },
}

export default [host, createClientBundle('dsh-sketch-reference', 'src/client/index.ts')]
