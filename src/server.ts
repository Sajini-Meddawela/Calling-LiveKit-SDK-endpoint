import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import express from "express";
import http from "http";
import cors from "cors";
import { createClient, RedisClientType } from "redis";
import { useServer } from "graphql-ws/lib/use/ws";
import { PubSub } from "graphql-subscriptions";
import typeDefs from "./graphql/schema";
import resolvers from "./graphql/resolvers";
import dotenv from "dotenv";

dotenv.config();

// Hosted Redis URL
const REDIS_URL = process.env.REDIS_URL as string;

// Initialize Redis client
const redisClient: RedisClientType = createClient({ url: REDIS_URL });
redisClient.on("error", (err) => console.error("❌ Redis Error:", err));

// Create PubSub instance
const pubsub = new PubSub();

// Create executable schema
const schema = makeExecutableSchema({ typeDefs, resolvers });

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // WebSocket setup for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });

  useServer(
    {
      schema,
      context: async () => {
        console.log("✅ WebSocket Client Connected");
        return { pubsub };
      },
      onConnect: () => console.log("🔄 WebSocket Connection Established"),
      onClose: () => console.log("🔴 WebSocket Disconnected"),
    },
    wsServer
  );

  // Initialize Apollo Server
  const server = new ApolloServer({ schema });
  await server.start();

  app.use(cors({ origin: "*", credentials: true }));
  app.use(
    "/graphql",
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        const agentId = req.headers["x-agent-id"];
        return { pubsub, agentId };
      },
    })
  );

  const PORT = parseInt(process.env.GRAPHQL_PORT || "4000", 10);
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running at ${process.env.GRAPHQL_HTTP_URL}`);
    console.log(`📡 Subscriptions ready at ${process.env.GRAPHQL_WS_URL}`);
  });
}

startServer();