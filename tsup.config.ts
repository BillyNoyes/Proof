import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/action.ts', 'src/build-action.ts'],
  format: ['cjs'],
  target: 'node24',
  sourcemap: true,
  clean: true,
  noExternal: ['@actions/core'],
  outExtension: () => ({js: '.cjs'}),
});
