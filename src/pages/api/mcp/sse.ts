import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "@/lib/mcp";
import type { NextApiRequest, NextApiResponse } from "next";

export const transports = new Map<string, SSEServerTransport>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }
  
  const sessionId = crypto.randomUUID();
  const transport = new SSEServerTransport(`/api/mcp/messages?sessionId=${sessionId}`, res);
  transports.set(sessionId, transport);
  
  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);
  
  req.on("close", () => {
    transports.delete(sessionId);
    transport.close();
  });
}
