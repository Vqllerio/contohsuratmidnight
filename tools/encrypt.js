/* ============================================================
   Encrypt plaintext letters → js/data.js
   Run: node encrypt.js    (or: npm run build)
   ============================================================ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ITERATIONS = 250000;
const KEY_LEN = 32;         // AES-256
const SALT_LEN = 16;
const IV_LEN = 12;          // GCM standard

// ⬇️ MUST match js/crypto.js — trim + lowercase for case-insensitive codes
function normalizeCode(code) {
  return String(code || '').trim().toLowerCase();
}

function deriveKey(code, salt) {
  const normalized = normalizeCode(code);
  return crypto.pbkdf2Sync(normalized, salt, ITERATIONS, KEY_LEN, 'sha256');
}

function encryptPayload(payload, code) {
  const plaintext = JSON.stringify(payload);
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(code, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  // Web Crypto expects ciphertext || authTag concatenated
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    ct: combined.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    iter: ITERATIONS
  };
}

function buildPublicData(people) {
  return people.map(p => {
    const secretPayload = {
      title: p.title,
      letter: p.letter,
      secretMsg: p.secretMsg,
      awardTitle: p.awardTitle,
      awardDesc: p.awardDesc
    };

    return {
      id: p.id,
      name: p.name,
      accent: p.accent,
      awardIcon: p.awardIcon,
      photos: p.photos || [],
      encrypted: encryptPayload(secretPayload, p.code)
    };
  });
}

function main() {
  const plaintextFile = path.join(__dirname, 'letters.plaintext.js');
  const outputFile = path.join(__dirname, '..', 'js', 'data.js');

  if (!fs.existsSync(plaintextFile)) {
    console.error('❌ tools/letters.plaintext.js not found.');
    process.exit(1);
  }

  // bust require cache so re-runs pick up edits
  delete require.cache[require.resolve(plaintextFile)];
  const people = require(plaintextFile);
  const publicData = buildPublicData(people);

  const header =
`/* ============================================================
   A Little Love — GENERATED FILE. DO NOT EDIT BY HAND.
   Run \`npm run build\` in /tools to regenerate.
   Built: ${new Date().toISOString()}
   ============================================================ */

const PEOPLE = `;

  const body = JSON.stringify(publicData, null, 2) + ';\n';

  fs.writeFileSync(outputFile, header + body, 'utf8');

  console.log(`✅ Encrypted ${people.length} letter(s) → js/data.js`);
  people.forEach(p => {
    console.log(`   • ${p.name.padEnd(12)} (code length: ${p.code.length})`);
  });
  console.log('\n🔒 Verify: open js/data.js — you should see only base64 blobs.');
}

main();