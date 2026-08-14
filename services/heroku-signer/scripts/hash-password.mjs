import crypto from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash-password -- \"your-password\"");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64, {
  N: 16384,
  r: 8,
  p: 1
});

console.log(`scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`);
