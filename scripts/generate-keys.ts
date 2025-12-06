import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function generateKey(): string {
  const randomBytes = crypto.randomBytes(32);
  return crypto.createHash('sha256').update(randomBytes).digest('hex');
}

function updateEnvFile(
  filePath: string,
  keys: { apiKey: string; hmacKey: string }
) {
  try {
    let envContent = '';

    // Read existing content if file exists
    if (fs.existsSync(filePath)) {
      envContent = fs.readFileSync(filePath, 'utf8');
    }

    // Replace or add API_KEY
    if (envContent.includes('API_KEY=')) {
      envContent = envContent.replace(
        /API_KEY=.*\n/,
        `API_KEY=${keys.apiKey}\n`
      );
    } else {
      envContent += `\n# Security\nAPI_KEY=${keys.apiKey}\n`;
    }

    // Replace or add HMAC_SECRET_KEY
    if (envContent.includes('HMAC_SECRET_KEY=')) {
      envContent = envContent.replace(
        /HMAC_SECRET_KEY=.*\n/,
        `HMAC_SECRET_KEY=${keys.hmacKey}\n`
      );
    } else {
      envContent += `HMAC_SECRET_KEY=${keys.hmacKey}\n`;
    }

    // Write back to file
    fs.writeFileSync(filePath, envContent.trim() + '\n');
    console.log(`✓ Successfully updated ${filePath}`);
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error);
  }
}

async function main() {
  console.log('\n=== Generated Security Keys ===\n');

  const keys = {
    apiKey: generateKey(),
    hmacKey: generateKey(),
  };

  const filePath = path.join(process.cwd(), '.env.local');
  updateEnvFile(filePath, keys);

  console.log('\nAPI Key:');
  console.log(keys.apiKey);
  console.log('\nHMAC Secret Key:');
  console.log(keys.hmacKey);
}

main().catch(console.error);
