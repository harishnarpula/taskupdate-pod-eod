import fs from "fs";
import path from "path";

export function createWorkflow() {

  const workflowId =
    `wf_${Date.now()}`;

  const workflowDir = path.resolve(
    `./output/workflows/${workflowId}`
  );

  fs.mkdirSync(workflowDir, {
    recursive: true,
  });

  return {
    workflowId,
    workflowDir,
  };
}