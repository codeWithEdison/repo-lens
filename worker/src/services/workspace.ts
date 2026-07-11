import { WorkspaceService } from "@shared/workspace/workspaceService.js";
import { env } from "../config/env.js";

/** Single shared WorkspaceService instance for the worker process. */
export const workspace = new WorkspaceService(env.WORKSPACE_ROOT);
