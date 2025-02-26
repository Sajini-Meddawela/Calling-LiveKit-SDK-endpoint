import { RedisPubSub } from "graphql-redis-subscriptions";
import { createClient, RedisClientType } from "redis";
import axios from "axios";
import { GraphQLResolveInfo } from "graphql";

const AGENT_ASSIGNED = "AGENT_ASSIGNED";
const LIVEKIT_TOKEN_URL = "http://livekit.dialdesk.cloud:8080/auth/get-token";

// Initialize Redis clients
const redisClient: RedisClientType = createClient({
  url: process.env.REDIS_URL || "redis://livekit.dialdesk.cloud:6379",
});

redisClient.on("error", (err) => console.error("❌ Redis Client Error:", err));

async function initializeRedisPubSub(): Promise<RedisPubSub> {
  await redisClient.connect();
  const publisher = redisClient.duplicate();
  const subscriber = redisClient.duplicate();

  await Promise.all([publisher.connect(), subscriber.connect()]);

  console.log("✅ Redis Pub/Sub initialized successfully.");
  return new RedisPubSub({
    publisher: publisher as any,
    subscriber: subscriber as any,
  });
}

let pubsub: RedisPubSub | null = null;

// Initialize PubSub
(async () => {
  try {
    pubsub = await initializeRedisPubSub();
  } catch (error) {
    console.error("❌ Error initializing Redis PubSub:", error);
  }
})();

interface RouteToAgentArgs {
  roomId: string;
  agentId: string;
}

interface RoomToken {
  agentId: string;
  roomId: string;
  token: string;
}

interface Context {
  pubsub: RedisPubSub;
}

const resolvers = {
  Query: {
    getRoomToken: async (_: unknown, { roomId, agentId }: RouteToAgentArgs): Promise<RoomToken> => {
      try {
        console.log(`🔍 Fetching token for room: ${roomId}, agent: ${agentId}`);

        if (!redisClient.isOpen) {
          throw new Error("❌ Redis client is not connected.");
        }

        const token = await redisClient.hGet(`room:${roomId}`, agentId);

        if (!token) {
          console.warn(`⚠️ No token found in Redis for room ${roomId}, agent ${agentId}.`);
          throw new Error("No active session found.");
        }

        return { agentId, roomId, token };
      } catch (error) {
        console.error("❌ Error fetching token:", error);
        throw new Error("Failed to retrieve token.");
      }
    },
  },

  Mutation: {
    routeToAgent: async (_: unknown, { roomId, agentId }: RouteToAgentArgs, { pubsub }: Context): Promise<RoomToken> => {
      try {
        console.log(`🚀 Routing agent ${agentId} to room ${roomId}...`);

        const response = await axios.post(LIVEKIT_TOKEN_URL, { agentId, roomId });

        if (!response.data?.token) {
          throw new Error("Failed to generate token.");
        }

        const token = response.data.token;

        if (!redisClient.isOpen) {
          throw new Error("❌ Redis client is not connected.");
        }

        await redisClient.hSet(`room:${roomId}`, agentId, token);

        if (!pubsub) {
          throw new Error("❌ Internal server error: PubSub not available.");
        }

        const assignment: RoomToken = { agentId, roomId, token };

        try {
          await pubsub.publish(AGENT_ASSIGNED, { agentAssigned: assignment });
        } catch (err) {
          console.error("❌ Error publishing subscription event:", err);
          throw new Error("Failed to notify subscribers.");
        }

        return assignment;
      } catch (error) {
        console.error("❌ Error routing agent:", error);
        throw new Error("Failed to route agent.");
      }
    },
  },

  Subscription: {
    agentAssigned: {
      subscribe: async (_: unknown, __: unknown, { pubsub }: Context) => {
        if (!pubsub) {
          throw new Error("❌ PubSub is not initialized.");
        }

        try {
          return pubsub.asyncIterator<RoomToken>(AGENT_ASSIGNED);
        } catch (err) {
          console.error("❌ Error in subscription:", err);
          throw new Error("Subscription error occurred.");
        }
      },
      resolve: (payload: { agentAssigned: RoomToken }) => {
        if (!payload || !payload.agentAssigned) {
          throw new Error("No agent assigned.");
        }
        return payload.agentAssigned;
      },
    },
  },
};

export default resolvers;
