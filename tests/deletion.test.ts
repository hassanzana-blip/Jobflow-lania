import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteCandidateData,
  type DeletionPorts,
} from "../src/core/deletion.ts";
test("storage failure keeps database records for retry and never reports completed", async () => {
  const called: string[] = [];
  const ports: DeletionPorts = {
    async stopWork() {
      called.push("stop");
    },
    async listObjects() {
      return [{ bucket: "private", key: "cv" }];
    },
    async removeObject() {
      called.push("remove");
      throw new Error("offline");
    },
    async deleteRows() {
      called.push("rows");
    },
    async deleteIdentity() {
      called.push("identity");
    },
    async complete() {
      called.push("complete");
    },
  };
  await assert.rejects(() => deleteCandidateData("user", ports));
  assert.deepEqual(called, ["stop", "remove"]);
});
test("identity deletion follows storage and dependent row deletion", async () => {
  const called: string[] = [];
  await deleteCandidateData("user", {
    async stopWork() {
      called.push("stop");
    },
    async listObjects() {
      return [{ bucket: "private", key: "cv" }];
    },
    async removeObject() {
      called.push("storage");
    },
    async deleteRows() {
      called.push("rows");
    },
    async deleteIdentity() {
      called.push("identity");
    },
    async complete() {
      called.push("complete");
    },
  });
  assert.deepEqual(called, ["stop", "storage", "rows", "identity", "complete"]);
});
