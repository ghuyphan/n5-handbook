
import fs from 'fs';
import path from 'path';
import { html } from 'satori-html';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

async function generateOG() {
    console.log('Generating OG Image...');

    const width = 1200;
    const height = 630;

    // Paths
    const publicDir = path.resolve('public/assets');
    const iconPath = path.join(publicDir, 'siteIcon.png');
    const outputPath = path.join(publicDir, 'og.png');

    // 1. Get Resources

    // Font: Noto Sans JP (Bold)
    // Using a reliable CDN link for the raw font file. 
    // This is Noto Sans JP Bold 700
    const fontUrl = 'https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf';

    let fontData;
    try {
        console.log('Fetching Font...');
        // For reliability and speed in this specific script context, let's use a standard font fetch.
        // If this fails, we might need a local fallback or a different URL.
        const response = await fetch(fontUrl);
        if (!response.ok) throw new Error('Failed to fetch font');
        fontData = await response.arrayBuffer();
    } catch (e) {
        console.error('Error fetching font:', e);
        return;
    }

    // Icon
    let iconBase64;
    try {
        const iconBuffer = fs.readFileSync(iconPath);
        iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;
    } catch (e) {
        console.warn('Could not load siteIcon.png, proceeding without it.');
    }

    // 2. Define Template (Washi Paper Aesthetic)
    // Satori supports a subset of CSS. Flexbox is best.
    const markup = html`
        <div style="
            display: flex;
            height: 100%;
            width: 100%;
            align-items: center;
            justify-content: center;
            letter-spacing: -0.02em;
            background-color: #F7F3ED;
            font-family: 'Noto Sans JP', sans-serif;
            position: relative;
        ">
            <!-- Washi Texture Simulation (Noise) -->
            <div style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                opacity: 0.05;
                background-image: radial-gradient(#000 1px, transparent 1px);
                background-size: 16px 16px; 
            "></div>

            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px;
                border: 8px solid #2998FF;
                background-color: #fff;
                border-radius: 24px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.1);
                width: 90%;
                height: 80%;
            ">
                 ${iconBase64 ? `<img src="${iconBase64}" width="128" height="128" style="margin-bottom: 24px; border-radius: 20%;" />` : ''}
                
                <h1 style="
                    font-size: 72px;
                    font-weight: 700;
                    background: linear-gradient(to bottom right, #2998FF, #1e70bf);
                    background-clip: text;
                    color:透明; 
                    margin: 0;
                    margin-bottom: 16px;
                ">
                    JLPT Handbook
                </h1>
                
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 24px;
                ">
                     <span style="
                        background-color: #D45A5A;
                        color: white;
                        padding: 8px 24px;
                        border-radius: 50px;
                        font-size: 24px;
                        font-weight: 600;
                     ">N5</span>
                     <span style="
                        background-color: #D4A84A;
                        color: white;
                        padding: 8px 24px;
                        border-radius: 50px;
                        font-size: 24px;
                        font-weight: 600;
                     ">N4</span>
                </div>

                <p style="
                    font-size: 32px;
                    color: #4B5563;
                    text-align: center;
                    max-width: 800px;
                    line-height: 1.4;
                    margin: 0;
                ">
                    Your personal, interactive space to master Japanese.
                </p>
            </div>
            
            <!-- Decor elements -->
             <div style="
                position: absolute;
                bottom: 40px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 24px;
                color: #9CA3AF;
            ">
                <span>jlpthandbook.space</span>
            </div>
        </div>
    `;

    // 3. Generate SVG
    const svg = await satori(markup, {
        width,
        height,
        fonts: [
            {
                name: 'Noto Sans JP',
                data: fontData,
                weight: 700,
                style: 'normal',
            },
        ],
    });

    // 4. Render to PNG
    const resvg = new Resvg(svg, {
        fitTo: {
            mode: 'width',
            value: width,
        },
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // 5. Save
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`OG Image generated at: ${outputPath}`);
}

generateOG();
