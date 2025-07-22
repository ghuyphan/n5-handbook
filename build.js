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
// Use the esbuild JavaScript API
esbuild.build({
  entryPoints: ['js/main.js'],
  bundle: true,
  minify: !isDev,      // Only minify for production builds
  splitting: true,
  outdir: 'dist',
  format: 'esm',
  sourcemap: isDev,   // Only create sourcemaps for dev builds
  define: {
    // Inject the version number from package.json
    'process.env.APP_VERSION': JSON.stringify(version)
  }
}).then(() => {
  console.log('✅ JavaScript build successful.');
}).catch((e) => {
  console.error('❌ JavaScript build failed:', e);
  process.exit(1);
});