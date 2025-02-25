import { RedisPubSub } from "graphql-redis-subscriptions";
import { createClient, RedisClientType } from "redis";
import { GraphQLResolveInfo } from "graphql";
import axios from "axios";

const AGENT_ASSIGNED = "AGENT_ASSIGNED";
const LIVEKIT_TOKEN_URL = "http://livekit.dialdesk.cloud:8080/auth/get-token";

// Initialize Redis clients
const redisClient: RedisClientType = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => console.error("Redis Client Error:", err));

// Function to initialize Redis Pub/Sub
async function initializeRedisPubSub(): Promise<RedisPubSub> {
  await redisClient.connect();

  const publisher = redisClient.duplicate() as RedisClientType;
  const subscriber = redisClient.duplicate() as RedisClientType;

  await Promise.all([publisher.connect(), subscriber.connect()]);

  console.log("✅ Redis Pub/Sub initialized successfully.");

  return new RedisPubSub({
    publisher: publisher as any, // Type workaround
    subscriber: subscriber as any,
  });
}

let pubsub: RedisPubSub | null = null;

// Ensure RedisPubSub is initialized before using it
(async () => {
  try {
    pubsub = await initializeRedisPubSub();
  } catch (error) {
    console.error("❌ Error initializing Redis PubSub:", error);
  }
})();

// TypeScript interfaces for GraphQL arguments
interface GetAvailableAgentsArgs {
  department: string;
}

interface AssignAgentArgs {
  roomId: string;
  agentId: string;
}

interface GetRoomTokenArgs {
  roomId: string;
  agentId: string;
}

interface AddMultipleAgentsArgs {
  agents: { id: string; name: string }[];
}

interface Agent {
  id: string;
  name: string;
  isAvailable: boolean;
}

interface RoomToken {
  agentId: string;
  roomId: string;
  token: string;
}

interface Context {
  pubsub: RedisPubSub;
}

// GraphQL Resolvers
const resolvers = {
  Query: {
    getAvailableAgents: async (
      _: unknown,
      { department }: GetAvailableAgentsArgs
    ): Promise<Agent[]> => {
      try {
        console.log(`Fetching available agents for department: ${department}`);

        const agents = await redisClient.hGetAll(`agents:${department}`);

        if (!agents || Object.keys(agents).length === 0) {
          console.warn(`⚠️ No available agents found for department: ${department}`);
          return [];
        }

        return Object.values(agents).map((agent) => JSON.parse(agent)) as Agent[];
      } catch (error) {
        console.error("❌ Error fetching agents:", error);
        throw new Error("Failed to retrieve available agents.");
      }
    },

    getRoomToken: async (
      _: unknown,
      { roomId, agentId }: GetRoomTokenArgs
    ): Promise<RoomToken> => {
      try {
        console.log(`🔍 Fetching token for room: ${roomId}, agent: ${agentId}`);

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
    assignAgent: async (
      _: unknown,
      { roomId, agentId }: AssignAgentArgs
    ): Promise<RoomToken> => {
      try {
        console.log(`🔄 Assigning agent ${agentId} to room ${roomId}...`);

        const agentData = await redisClient.hGet("agents:all", agentId);

        if (!agentData) {
          throw new Error("Agent not found or unavailable.");
        }

        const assignedAgent: Agent = JSON.parse(agentData);
        if (!assignedAgent.isAvailable) {
          throw new Error("No available agents.");
        }

        const response = await axios.post(LIVEKIT_TOKEN_URL, { agentId, roomId });
        if (!response.data?.token) {
          throw new Error("Failed to generate token.");
        }

        const token = response.data.token;
        assignedAgent.isAvailable = false;
        await redisClient.hSet("agents:all", agentId, JSON.stringify(assignedAgent));

        if (!pubsub) {
          throw new Error("Internal server error: PubSub not available.");
        }

        const assignment: RoomToken = { agentId: assignedAgent.id, roomId, token };
        await pubsub.publish(AGENT_ASSIGNED, { agentAssigned: assignment });

        return assignment;
      } catch (error) {
        console.error("❌ Error assigning agent:", error);
        throw new Error("Failed to assign agent.");
      }
    },

    addMultipleAgents: async (
      _: unknown,
      { agents }: AddMultipleAgentsArgs
    ): Promise<{ message: string }> => {
      try {
        for (const agent of agents) {
          const newAgent = { ...agent, isAvailable: true };
          await redisClient.hSet("agents:all", agent.id, JSON.stringify(newAgent));
        }

        return { message: `Added ${agents.length} agents successfully.` };
      } catch (error) {
        console.error("❌ Error adding multiple agents:", error);
        throw new Error("Failed to add multiple agents.");
      }
    },
  },

  Subscription: {
    agentAssigned: {
      subscribe: (_: unknown, __: unknown, { pubsub }: Context) => {
        return pubsub.asyncIterator<RoomToken>(AGENT_ASSIGNED);
      },
      resolve: (payload: { agentAssigned: RoomToken }) => {
        if (!payload) {
          throw new Error("No agent assigned");
        }
        return payload.agentAssigned;
      },
    },
  },
};

export default resolvers;
