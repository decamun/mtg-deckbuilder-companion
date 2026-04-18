import { transports } from "./sse";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).send("Missing sessionId");
    return;
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).send("Session not found");
    return;
  }

  // Next.js body parser automatically parses JSON, but handlePostMessage expects to read from the stream or requires raw body
  // Wait, if Next.js parses it into `req.body`, the transport might fail if it tries to read `req` as a stream.
  // We should pass req and res, but we may need to disable the body parser.
  await transport.handlePostMessage(req, res);
}

export const config = {
  api: {
    bodyParser: false, // The SDK might consume the stream directly
  },
};
