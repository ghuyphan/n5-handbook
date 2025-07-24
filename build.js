// build.js
const esbuild = require('esbuild');
const { execSync } = require('child_process');
const { version } = require('./package.json');
const fs = require('fs');
const path = require('path');

const isDev = process.argv.includes('--dev');
const outdir = 'dist';

// Step 1: Build CSS
console.log('Building CSS...');
try {
  execSync('npm run build:css:main', { stdio: 'inherit' });
  execSync('npm run build:css:deferred', { stdio: 'inherit' });
  console.log('✅ CSS build successful.');
} catch (e) {
  console.error('❌ CSS build failed.');
  process.exit(1);
}

// Step 2: Build JavaScript with Metafile
console.log(`Building JavaScript for ${isDev ? 'development' : 'production'}...`);
esbuild.build({
  entryPoints: ['js/main.js'],
  bundle: true,
  minify: !isDev,
  splitting: true,
  outdir: outdir,
  format: 'esm',
  sourcemap: isDev,
  metafile: true, 
  entryNames: '[dir]/[name]-[hash]',
  chunkNames: '[dir]/[name]-[hash]',
  define: {
    'process.env.APP_VERSION': JSON.stringify(version)
  }
}).then(result => {
  console.log('✅ JavaScript build successful.');
  // Step 3: Generate the Service Worker
  console.log('Generating Service Worker...');
  generateServiceWorker(result.metafile);
  console.log('✅ Service Worker generated successfully.');
}).catch((e) => {
  console.error('❌ JavaScript build failed:', e);
  process.exit(1);
});

function generateServiceWorker(metafile) {
  const staticAssets = [
    '/',
    '/index.html',
    '/dist/main.min.css',
    '/dist/deferred.min.css',
    '/assets/siteIcon.webp',
    '/assets/siteIcon.png',
    '/assets/og.png',
    '/manifest.json'
  ];

  const dynamicAssets = Object.keys(metafile.outputs)
    .filter(p => p.startsWith(outdir) && !p.endsWith('.map')) // <-- Added check to exclude .map files
    .map(p => `/${p.replace(/\\/g, '/')}`);

  const allCacheUrls = [...staticAssets, ...dynamicAssets];

  let swTemplate = fs.readFileSync('src/sw-template.js', 'utf-8');

  const swContent = swTemplate
    .replace('\'%%CACHE_NAME%%\'', `'jlpt-handbook-cache-v${version}'`)
    .replace('\'%%URLS_TO_CACHE%%\'', JSON.stringify(allCacheUrls, null, 2));

  fs.writeFileSync('service-worker.js', swContent);
}