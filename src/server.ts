import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "redis";
import { useServer } from "graphql-ws/lib/use/ws";
import typeDefs from "./graphql/schema";
import resolvers from "./graphql/resolvers";

dotenv.config();

// Redis Setup with error handling
const redisClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });

redisClient.on("error", (err) => {
  console.error("Redis Error:", err);
});

redisClient.connect().catch((err) => {
  console.error("Failed to connect to Redis:", err);
});

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });

  useServer(
    {
      schema,
      context: () => ({ redisClient }),
    },
    wsServer
  );

  const server = new ApolloServer({ 
    schema,
    csrfPrevention: false, // ✅ Disables CSRF Protection
  });

  await server.start();

  app.use(
    cors({
      origin: "http://localhost:3000", // ✅ Allow requests from your frontend
      credentials: true, // ✅ Allow cookies & auth headers
    })
  );

  // ✅ Updated CORS middleware to allow necessary headers
  app.use(
    "/graphql",
    cors({
      origin: "*", // Adjust this for security (e.g., specific frontend domain)
      allowedHeaders: ["Content-Type", "x-apollo-operation-name"],
      credentials: true,
    }),
    express.json(),
    expressMiddleware(server, { context: async () => ({ redisClient }) })
  );

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}/graphql`);
  });
}

startServer();
