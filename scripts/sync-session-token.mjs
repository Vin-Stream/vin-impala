import { copyFile, readFile } from "node:fs/promises";

const rootUrl = new URL("../", import.meta.url);
const sourceUrl = new URL("services/shared-auth/session-token.js", rootUrl);
const targetUrls = [
  new URL("services/heroku-signer/session-token.js", rootUrl),
  new URL("services/heroku-live-stream/session-token.js", rootUrl),
  new URL("services/heroku-sync-play/session-token.js", rootUrl),
  new URL("services/heroku-coast/session-token.js", rootUrl)
];
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const source = await readFile(sourceUrl, "utf8");
  const results = await Promise.all(targetUrls.map(async (targetUrl) => {
    try {
      return (await readFile(targetUrl, "utf8")) === source;
    } catch (_error) {
      return false;
    }
  }));
  if (results.some((matches) => !matches)) {
    throw new Error("A deployed session-token.js copy differs from services/shared-auth/session-token.js.");
  }
  console.log("Impala session-token deployment copies are aligned.");
} else {
  await Promise.all(targetUrls.map((targetUrl) => copyFile(sourceUrl, targetUrl)));
  console.log("Updated session-token.js in all independently deployed services.");
}
