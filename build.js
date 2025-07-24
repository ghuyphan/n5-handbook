const esbuild = require('esbuild');
const { execSync } = require('child_process');
const { version } = require('./package.json');
const fs = require('fs');
const path = require('path');

const isDev = process.argv.includes('--dev');
const outdir = 'dist';

// --- Step 0: Clean the output directory ---
console.log(`🧹 Cleaning up the '${outdir}' directory...`);
// This command removes the entire 'dist' folder and its contents.
// The build tools below will recreate it with the new files.
fs.rmSync(outdir, { recursive: true, force: true });
console.log('✅ Directory cleaned.');


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
  // Assuming your template is in a 'src' folder
  let htmlTemplate = fs.readFileSync('src/index.html', 'utf-8');

  const mainJsPath = Object.keys(metafile.outputs).find(
    (key) => metafile.outputs[key].entryPoint === 'js/main.js'
  );

  if (!mainJsPath) {
    console.error('❌ Could not find main JS entry point in metafile.');
    process.exit(1);
  }
  
  const mainJsUrl = `/${mainJsPath.replace(/\\/g, '/')}`;
  const scriptTags = `
    <link rel="preload" href="${mainJsUrl}" as="script" crossOrigin="anonymous">
    <script type="module" src="${mainJsUrl}"></script>
  `;

  // **FIXED LINE**: Replaces the specific placeholder in your HTML template.
  const finalHtml = htmlTemplate.replace('', scriptTags);

  fs.writeFileSync('index.html', finalHtml);
}

function generateServiceWorker(metafile) {
  const staticAssets = [
    '/',
    '/index.html', 
    '/offline.html',
    '/dist/main.min.css',
    '/dist/deferred.min.css',
    '/assets/siteIcon.webp',
    '/assets/siteIcon.png',
    '/assets/og.png',
    '/manifest.json'
  ];

  const dynamicAssets = Object.keys(metafile.outputs)
    .filter(p => p.startsWith(outdir) && !p.endsWith('.map'))
    .map(p => `/${p.replace(/\\/g, '/')}`);

  const allCacheUrls = [...new Set([...staticAssets, ...dynamicAssets])];

  let swTemplate = fs.readFileSync('src/sw-template.js', 'utf-8');

  const swContent = swTemplate
    .replace('\'%%CACHE_NAME%%\'', `'jlpt-handbook-cache-v${version}'`)
    .replace('\'%%URLS_TO_CACHE%%\'', JSON.stringify(allCacheUrls, null, 2));

  fs.writeFileSync('service-worker.js', swContent);
}