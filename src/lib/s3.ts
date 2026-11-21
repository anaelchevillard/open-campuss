import "server-only";
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateBucketCommand, CreateMultipartUploadCommand,
  DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { env } from "./env";

const globals = globalThis as unknown as { campusS3?: S3Client };

function client() {
  globals.campusS3 ??= new S3Client({
    endpoint: env.s3Endpoint,
    region: env.s3Region,
    forcePathStyle: true,
    credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return globals.campusS3;
}

const Bucket = () => env.s3Bucket;

export async function ensureBucket() {
  try {
    await client().send(new HeadBucketCommand({ Bucket: Bucket() }));
  } catch {
    await client().send(new CreateBucketCommand({ Bucket: Bucket() }));
  }
}

/** Pour le suivi de santé : une réponse lente vaut une panne. */
export async function storageReachable() {
  try {
    await client().send(new HeadBucketCommand({ Bucket: Bucket() }), { abortSignal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

export async function putObject(Key: string, Body: Buffer | string | Readable, ContentType: string, ContentLength?: number) {
  await client().send(new PutObjectCommand({ Bucket: Bucket(), Key, Body, ContentType, ContentLength }));
}

export async function getObject(Key: string, Range?: string) {
  try {
    return await client().send(new GetObjectCommand({ Bucket: Bucket(), Key, Range }));
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NoSuchKey" || name === "InvalidRange") return null;
    throw error;
  }
}

export async function getText(Key: string) {
  const object = await getObject(Key);
  return object?.Body ? object.Body.transformToString("utf-8") : null;
}

export async function getHead(Key: string, bytes: number): Promise<Buffer> {
  const object = await getObject(Key, `bytes=0-${bytes - 1}`);
  return object?.Body ? Buffer.from(await object.Body.transformToByteArray()) : Buffer.alloc(0);
}

export async function deletePrefix(Prefix: string) {
  if (!Prefix.endsWith("/")) throw new Error("préfixe invalide");
  let ContinuationToken: string | undefined;
  do {
    const page = await client().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix, ContinuationToken }));
    const Objects = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (Objects.length) await client().send(new DeleteObjectsCommand({ Bucket: Bucket(), Delete: { Objects } }));
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
}

export async function listKeys(Prefix: string) {
  const keys: string[] = [];
  let ContinuationToken: string | undefined;
  do {
    const page = await client().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix, ContinuationToken }));
    for (const object of page.Contents ?? []) keys.push(object.Key!);
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return keys;
}

export async function copyObject(from: string, Key: string) {
  await client().send(new CopyObjectCommand({ Bucket: Bucket(), Key, CopySource: `${Bucket()}/${from}` }));
}

export async function deleteKey(Key: string) {
  await client().send(new DeleteObjectsCommand({ Bucket: Bucket(), Delete: { Objects: [{ Key }] } }));
}

/** DeleteObjects accepte 1000 clés par requête. */
export async function deleteKeys(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    await client().send(new DeleteObjectsCommand({ Bucket: Bucket(), Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }));
  }
}

export async function listObjects(Prefix: string) {
  const found: { key: string; lastModified: Date }[] = [];
  let ContinuationToken: string | undefined;
  do {
    const page = await client().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix, ContinuationToken }));
    for (const object of page.Contents ?? []) found.push({ key: object.Key!, lastModified: object.LastModified ?? new Date() });
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return found;
}

export async function startMultipart(Key: string) {
  const out = await client().send(new CreateMultipartUploadCommand({
    Bucket: Bucket(), Key, ContentType: "application/octet-stream",
  }));
  return out.UploadId!;
}

export async function uploadPart(Key: string, UploadId: string, PartNumber: number, Body: Buffer) {
  const out = await client().send(new UploadPartCommand({
    Bucket: Bucket(), Key, UploadId, PartNumber, Body, ContentLength: Body.length,
  }));
  return out.ETag!;
}

export async function completeMultipart(Key: string, UploadId: string, Parts: { PartNumber: number; ETag: string }[]) {
  await client().send(new CompleteMultipartUploadCommand({
    Bucket: Bucket(), Key, UploadId, MultipartUpload: { Parts },
  }));
}

export async function abortMultipart(Key: string, UploadId: string) {
  await client().send(new AbortMultipartUploadCommand({ Bucket: Bucket(), Key, UploadId })).catch(() => undefined);
}

export const docPrefix = (docId: string) => `docs/${docId}/`;
export const versionPrefix = (docId: string, version: string) => `docs/${docId}/${version}/`;
export const fileKey = (fileId: string) => `files/${fileId}`;
export const revisionKey = (fileId: string) => `revision/${fileId}`;
export const cardImageKey = (imageId: string) => `cards/${imageId}`;
export const uploadKey = (uploadId: string) => `uploads/${uploadId}`;
