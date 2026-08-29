import { defineConfig } from "@prisma/config";

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
    // Only needed by commands that replay migrations into a scratch database
    // (`migrate dev`, and CI's migrations-vs-schema drift check).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
