const esbuild = require('esbuild');
const { execSync } = require('child_process');
const { version } = require('./package.json');
const fs = require('fs');
const path = require('path');

// Check if it's a development build
const isDev = process.argv.includes('--dev');

async function build() {
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
    publicPath: './',
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
  await esbuild.build(buildOptions);
  console.log('✅ JavaScript build successful.');

  // --- NEW: Generate Service Worker Precaching List ---
  console.log('Updating service worker cache list...');
  const distFolder = path.join(__dirname, 'dist');
  const swFilePath = path.join(__dirname, 'sw.js');

  try {
    // Read all filenames from the dist directory
    const assetFiles = fs.readdirSync(distFolder);
    const urlsToCache = assetFiles
        .filter(file => file.endsWith('.js') || file.endsWith('.css'))
        .map(file => `./dist/${file}`);

    // Add other essential files to the cache list
    urlsToCache.push(
        './',
        './index.html',
        './assets/siteIcon.webp',
        './assets/siteIcon.png',
        './assets/og.png',
        './manifest.json'
    );

    // Read the service worker file content
    let swContent = fs.readFileSync(swFilePath, 'utf-8');

    // Replace the placeholder with the dynamic list of URLs
    const cacheListString = JSON.stringify(urlsToCache, null, 2);
    swContent = swContent.replace('const urlsToCache = [];', `const urlsToCache = ${cacheListString};`);

    // Write the updated content back to the service worker file
    fs.writeFileSync(swFilePath, swContent);

    console.log('✅ Service worker cache list updated successfully.');
  } catch (e) {
    console.error('❌ Failed to update service worker.', e);
    process.exit(1);
  }
}

// Run the build process
build().catch((e) => {
    console.error('❌ Build process failed:', e);
    process.exit(1);
});