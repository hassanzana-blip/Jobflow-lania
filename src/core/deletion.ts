export interface DeletionPorts {
  stopWork(userId: string): Promise<void>;
  listObjects(userId: string): Promise<{ bucket: string; key: string }[]>;
  removeObject(bucket: string, key: string): Promise<void>;
  deleteRows(userId: string): Promise<void>;
  deleteIdentity(userId: string): Promise<void>;
  complete(userId: string): Promise<void>;
}
export async function deleteCandidateData(
  userId: string,
  ports: DeletionPorts,
) {
  // Intentionally ordered: keep object keys until removal succeeds. Any failure
  // leaves a retryable request and never falsely reports completion.
  await ports.stopWork(userId);
  for (const object of await ports.listObjects(userId))
    await ports.removeObject(object.bucket, object.key);
  await ports.deleteRows(userId);
  await ports.deleteIdentity(userId);
  await ports.complete(userId);
}
