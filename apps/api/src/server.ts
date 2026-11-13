import { createApp } from "./app.js";
import { env } from "./env.js";

const host = process.env.HOST || (env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

createApp().listen(env.PORT, host, () => {
  console.log(`api listening on http://${host}:${env.PORT} (${env.NODE_ENV})`);
});
