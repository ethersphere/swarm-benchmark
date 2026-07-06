import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Internal modules are bundled (so extensionless imports resolve at build
  // time); npm dependencies stay external and load from node_modules at runtime.
  banner: { js: '#!/usr/bin/env node' },
});
