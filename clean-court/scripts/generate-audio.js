import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration - Change these to customize the voice!
const VOICE_NAME = 'en-GB-Neural2-F'; // Premium British Neural2 Female Voice
const LANGUAGE_CODE = 'en-GB';
const AUDIO_ENCODING = 'MP3';

// Paths
const narrationsPath = path.resolve(__dirname, '../src/data/narrations.json');
const outputDir = path.resolve(__dirname, '../public/audio');

async function main() {
  // 1. Get API Key
  const apiKey = process.env.GOOGLE_API_KEY || process.argv[2];
  if (!apiKey) {
    console.error('\x1b[31mError: Google Cloud API Key is required!\x1b[0m');
    console.log('\nPlease run the script with your API key:');
    console.log('  node scripts/generate-audio.js YOUR_API_KEY');
    console.log('or set it as an environment variable:');
    console.log('  $env:GOOGLE_API_KEY="YOUR_API_KEY" (PowerShell) or export GOOGLE_API_KEY="YOUR_API_KEY" (bash)\n');
    process.exit(1);
  }

  // 2. Read narrations JSON
  if (!fs.existsSync(narrationsPath)) {
    console.error(`Error: Cannot find narrations file at ${narrationsPath}`);
    process.exit(1);
  }

  const narrations = JSON.parse(fs.readFileSync(narrationsPath, 'utf8'));
  console.log(`Loaded ${narrations.length} narration descriptions.`);

  // 3. Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  // 4. Synthesize speech step-by-step
  for (let i = 0; i < narrations.length; i++) {
    const step = narrations[i];
    const filename = `step_${i}.mp3`;
    const outputPath = path.join(outputDir, filename);

    console.log(`\n[${i + 1}/${narrations.length}] Synthesizing "${step.title}"...`);
    console.log(`  Text: "${step.text}"`);

    try {
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text: step.text },
          voice: {
            languageCode: LANGUAGE_CODE,
            name: VOICE_NAME
          },
          audioConfig: {
            audioEncoding: AUDIO_ENCODING,
            speakingRate: 1.02 // Slightly faster for clean, prompt delivery
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const audioBuffer = Buffer.from(data.audioContent, 'base64');
      fs.writeFileSync(outputPath, audioBuffer);
      console.log(`  \x1b[32mSaved: ${filename} (${(audioBuffer.length / 1024).toFixed(1)} KB)\x1b[0m`);
      
      // Delay slightly between requests to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (err) {
      console.error(`  \x1b[31mFailed to synthesize step_${i}: ${err.message}\x1b[0m`);
    }
  }

  console.log('\n\x1b[32mAll narrations synthesized successfully!\x1b[0m');
}

main();
