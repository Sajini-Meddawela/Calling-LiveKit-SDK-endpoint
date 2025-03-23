import { PubSub } from "graphql-subscriptions";
import axios from "axios";
import dotenv from "dotenv";
import { withFilter } from "graphql-subscriptions";

dotenv.config();

const AGENT_ASSIGNED = "AGENT_ASSIGNED";
const LIVEKIT_TOKEN_URL = process.env.LIVEKIT_TOKEN_URL as string;
const PICK_AGENT_URL = "https://livekit.dialdesk.cloud/api/v1/agents/pick";

const pubsub = new PubSub<{ AGENT_ASSIGNED: { agentAssigned: RoomToken } }>();

interface RouteToAgentInput {
  roomId: string;
  session: string;
  agentType: string;
  department: string;
  languages: string[];
}

interface RoomToken {
  agentId: string;
  roomId: string;
  token: string;
  department: string;
  languages: string[]; 
}

const resolvers = {
  Query: {
    getRoomToken: async (_: unknown, { roomId, agentId }: { roomId: string, agentId: string }): Promise<RoomToken> => {
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
    routeToAgent: async (_: unknown, { input }: { input: RouteToAgentInput }): Promise<RoomToken> => {
      try {
        console.log(`🚀 Routing agent to room ${input.roomId}...`);

        // Fetch agent assignment details from PICK_AGENT_URL
        const pickAgentResponse = await axios.post(PICK_AGENT_URL, input);

        if (!pickAgentResponse.data?.roomId) {
          throw new Error("Failed to pick a room.");
        }

        const { roomId, department, languages } = pickAgentResponse.data;

        // Fetch LiveKit token for the room
        const tokenResponse = await axios.post(LIVEKIT_TOKEN_URL, { roomId });

        if (!tokenResponse.data?.token) {
          throw new Error("Failed to generate token.");
        }

        const token = tokenResponse.data.token;
        const assignment: RoomToken = { agentId: "N/A", roomId, token, department, languages };

        // Publish the assignment to the correct agents
        await pubsub.publish(AGENT_ASSIGNED, {
          agentAssigned: assignment
        });

        return assignment;
      } catch (error) {
        console.error("❌ Error routing agent:", error);
        throw new Error("Failed to route agent.");
      }
    },
  },

  Subscription: {
    agentAssigned: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator(AGENT_ASSIGNED),
        (payload, variables) => {
          // Filter agents based on department and languages
          return (
            payload.agentAssigned.department === variables.department &&
            variables.languages.every((lang: string) =>
              payload.agentAssigned.languages.includes(lang)
            )
          );
        }
      ),
      resolve: (payload: { agentAssigned: RoomToken }) => payload.agentAssigned,
    },
  },
};

export default resolvers;