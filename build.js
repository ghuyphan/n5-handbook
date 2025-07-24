const esbuild = require('esbuild');
const { execSync } = require('child_process');
const { version } = require('./package.json');
const fs = require('fs');
const path = require('path');

const isDev = process.argv.includes('--dev');
const outdir = 'dist';

// --- Step 1: Build CSS ---
console.log('Building CSS...');
try {
  execSync('npm run build:css:main', { stdio: 'inherit' });
  execSync('npm run build:css:deferred', { stdio: 'inherit' });
  console.log('✅ CSS build successful.');
} catch (e) {
  console.error('❌ CSS build failed.');
  process.exit(1);
}

// --- Step 2: Build JavaScript with Metafile ---
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

  // --- Step 3: Generate the final HTML from the template ---
  console.log('Generating index.html...');
  generateHtml(result.metafile);
  console.log('✅ index.html generated successfully.');

  // --- Step 4: Generate the Service Worker ---
  console.log('Generating Service Worker...');
  generateServiceWorker(result.metafile);
  console.log('✅ Service Worker generated successfully.');

}).catch((e) => {
  console.error('❌ JavaScript build failed:', e);
  process.exit(1);
});

function generateHtml(metafile) {
  let htmlTemplate = fs.readFileSync('src/index.html', 'utf-8');

  // Find the main JS entry point from the esbuild metafile
  const mainJsPath = Object.keys(metafile.outputs).find(
    (key) => metafile.outputs[key].entryPoint === 'js/main.js'
  );

  if (!mainJsPath) {
    console.error('❌ Could not find main JS entry point in metafile.');
    process.exit(1);
  }

  const scriptTags = `
    <link rel="preload" href="/${mainJsPath.replace(/\\/g, '/')}" as="script" crossOrigin="anonymous">
    <script type="module" src="/${mainJsPath.replace(/\\/g, '/')}"></script>
  `;

  const finalHtml = htmlTemplate.replace('', scriptTags);

  // Write the final, production-ready HTML file to the root directory
  // This is often simpler for deployment with services like GitHub Pages.
  fs.writeFileSync('index.html', finalHtml);
}

function generateServiceWorker(metafile) {
  const staticAssets = [
    '/',
    '/index.html', // The dynamically generated index.html
    '/offline.html', // Your offline fallback page
    '/dist/main.min.css',
    '/dist/deferred.min.css',
    '/assets/siteIcon.webp',
    '/assets/siteIcon.png',
    '/assets/og.png',
    '/manifest.json'
  ];

  // Extract the generated JS output paths from the metafile
  const dynamicAssets = Object.keys(metafile.outputs)
    .filter(p => p.startsWith(outdir) && !p.endsWith('.map'))
    .map(p => `/${p.replace(/\\/g, '/')}`);

  const allCacheUrls = [...new Set([...staticAssets, ...dynamicAssets])];

  let swTemplate = fs.readFileSync('src/sw-template.js', 'utf-8');

  const swContent = swTemplate
    .replace('\'%%CACHE_NAME%%\'', `'jlpt-handbook-cache-v${version}'`)
    .replace('\'%%URLS_TO_CACHE%%\'', JSON.stringify(allCacheUrls, null, 2));

  // Write the final service worker to the root directory.
  fs.writeFileSync('service-worker.js', swContent);
}