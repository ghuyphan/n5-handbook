const esbuild = require('esbuild');
const { execSync } = require('child_process');
const { version } = require('./package.json');

// Check if it's a development build
const isDev = process.argv.includes('--dev');

console.log('Building CSS...');
try {
  // Run the existing CSS build scripts from package.json
  execSync('npm run build:css:main', { stdio: 'inherit' });
  execSync('npm run build:css:deferred', { stdio: 'inherit' });
  console.log('✅ CSS build successful.');
} catch (e) {
  console.error('❌ CSS build failed.');
  process.exit(1);
}

console.log(`Building JavaScript for ${isDev ? 'development' : 'production'}...`);

// Define esbuild options
const buildOptions = {
  entryPoints: ['js/main.js'],
  bundle: true,
  minify: !isDev,
  splitting: true,
  outdir: 'dist',
  format: 'esm',
  sourcemap: isDev,
  define: {
    'process.env.APP_VERSION': JSON.stringify(version)
  },
};

// Use predictable filenames for development builds to avoid hashes
if (isDev) {
  buildOptions.entryNames = '[name]';
  buildOptions.chunkNames = '[name]';
}

// Use the esbuild JavaScript API
esbuild.build(buildOptions).then(() => {
  console.log('✅ JavaScript build successful.');
}).catch((e) => {
  console.error('❌ JavaScript build failed:', e);
  process.exit(1);
});