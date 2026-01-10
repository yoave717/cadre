import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18', // or newer, depending on requirements. 'node18' is a safe modern default.
  clean: true,
  dts: true, // Generate declaration files
  sourcemap: true,
  splitting: false, // CLI tools usually don't need splitting
  treeshake: true,
  external: [
    // Mark dependencies as external so they aren't bundled (optional, but good for CLIs to use node_modules)
    // tsup automatically marks peerDependencies as external.
    // We often want devDependencies bundled if they are used at runtime, but purely runtime deps should stay external if we are distributing a package that users `npm install`.
    // Since this is a CLI tool likely installed via `npm install -g` or used as a dev dep, it's safer to keep dependencies external.
    // tsup by default bundles nothing if not specified, but let's be explicit if needed.
    // Actually, tsup's default is to bundle *nothing* from node_modules unless --no-external is passed.
    // So dependencies in package.json will be required at runtime.
  ],
});
