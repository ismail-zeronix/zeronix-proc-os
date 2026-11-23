import "server-only";
import { readTools } from "./read-tools";
import type { McpTool } from "./tool";
import { writeTools } from "./write-tools";

/** Every tool of the Claude connector. Write tools are only listed and run for connections with the "write" permission. */
export const mcpTools: McpTool[] = [...readTools, ...writeTools];
