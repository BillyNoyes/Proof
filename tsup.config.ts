import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/action.ts', 'src/build-action.ts'],
  format: ['esm'],
  target: 'node24',
  sourcemap: true,
  clean: true,
  noExternal: ['@actions/core'],
});
