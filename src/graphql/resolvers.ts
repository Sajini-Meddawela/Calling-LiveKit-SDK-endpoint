import { PubSub } from "graphql-subscriptions";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const AGENT_ASSIGNED = "AGENT_ASSIGNED";
const LIVEKIT_TOKEN_URL = process.env.LIVEKIT_TOKEN_URL as string;

const pubsub = new PubSub<{ AGENT_ASSIGNED: { agentAssigned: RoomToken } }>();

interface RouteToAgentArgs {
  roomId: string;
  agentId: string;
}

interface RoomToken {
  agentId: string;
  roomId: string;
  token: string;
}

const resolvers = {
  Query: {
    getRoomToken: async (_: unknown, { roomId, agentId }: RouteToAgentArgs): Promise<RoomToken> => {
      try {
        console.log(`🔍 Fetching token for room: ${roomId}, agent: ${agentId}`);
        throw new Error("Fetching token directly is not supported in this implementation.");
      } catch (error) {
        console.error("❌ Error fetching token:", error);
        throw new Error("Failed to retrieve token.");
      }
    },
  },

  Mutation: {
    routeToAgent: async (_: unknown, { roomId, agentId }: RouteToAgentArgs): Promise<RoomToken> => {
      try {
        console.log(`🚀 Routing agent ${agentId} to room ${roomId}...`);

        const response = await axios.post(LIVEKIT_TOKEN_URL, { agentId, roomId });

        if (!response.data?.token) {
          throw new Error("Failed to generate token.");
        }

        const token = response.data.token;
        const assignment: RoomToken = { agentId, roomId, token };

        await pubsub.publish(AGENT_ASSIGNED, { agentAssigned: assignment });

        return assignment;
      } catch (error) {
        console.error("❌ Error routing agent:", error);
        throw new Error("Failed to route agent.");
      }
    },
  },

  Subscription: {
    agentAssigned: {
      subscribe: () => pubsub.asyncIterableIterator(AGENT_ASSIGNED),
      resolve: (payload: { agentAssigned: RoomToken }) => payload.agentAssigned,
    },
  },
};

export default resolvers;
