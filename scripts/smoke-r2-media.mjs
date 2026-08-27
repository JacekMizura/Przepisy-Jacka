/**
 * Smoke test against real S3-compatible storage (Cloudflare R2).
 * Requires MEDIA_S3_* in the environment (never commit secrets).
 *
 * Usage (PowerShell):
 *   $env:MEDIA_S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
 *   $env:MEDIA_S3_REGION="auto"
 *   $env:MEDIA_S3_BUCKET="przepisy-jacka-media"
 *   $env:MEDIA_S3_ACCESS_KEY_ID="..."
 *   $env:MEDIA_S3_SECRET_ACCESS_KEY="..."
 *   node scripts/smoke-r2-media.mjs
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Brak ${name} — ustaw lokalnie (nie commitować).`);
  }
  return value;
}

async function main() {
  const endpoint = requireEnv("MEDIA_S3_ENDPOINT");
  const region = requireEnv("MEDIA_S3_REGION");
  const bucket = requireEnv("MEDIA_S3_BUCKET");
  const accessKeyId = requireEnv("MEDIA_S3_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("MEDIA_S3_SECRET_ACCESS_KEY");

  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
  } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const key = `smoke/${randomUUID()}.png`;
  // 1×1 PNG
  const body = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  const putUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "image/png",
    }),
    { expiresIn: 300 },
  );

  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body,
  });
  if (!putRes.ok) {
    throw new Error(`Presigned PUT failed: ${putRes.status} ${await putRes.text()}`);
  }
  console.log("PUT ok");

  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  if ((head.ContentLength ?? 0) !== body.byteLength) {
    throw new Error(`HEAD size mismatch: ${head.ContentLength}`);
  }
  console.log("HEAD ok");

  const getUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 300 },
  );
  const getRes = await fetch(getUrl);
  if (!getRes.ok) {
    throw new Error(`Presigned GET failed: ${getRes.status}`);
  }
  const got = Buffer.from(await getRes.arrayBuffer());
  if (!got.equals(body)) {
    throw new Error("GET body mismatch");
  }
  console.log("GET ok");

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    throw new Error("Object still present after DELETE");
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    const name = error?.name;
    if (status !== 404 && name !== "NotFound" && name !== "NoSuchKey") {
      throw error;
    }
  }
  console.log("DELETE ok");
  console.log("R2 smoke PASS (test object removed)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
