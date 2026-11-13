import serverless from "serverless-http";
import { createApp } from "../../apps/api/src/app.js";

const app = createApp();
const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  // Normalize path so Express always sees /api/...
  if (event.path && event.path.startsWith("/.netlify/functions/api")) {
    const subPath = event.path.replace(/^\/\.netlify\/functions\/api/, "");
    event.path = subPath.startsWith("/api") ? subPath : `/api${subPath.startsWith("/") ? subPath : `/${subPath}`}`;
  }
  return serverlessHandler(event, context);
};
