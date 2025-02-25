import { gql } from "graphql-tag";

const typeDefs = gql`
  type Agent {
    id: String!
    name: String!
    status: String!
    expertise: String!
    isAvailable: Boolean!
  }

  type Assignment {
    agentId: String!
    roomId: String!
    token: String!
  }

  type Query {
    getAvailableAgents(department: String!): [Agent!]!
    getRoomToken(roomId: String!, agentId: String!): Assignment!
  }

  type Mutation {
    assignAgent(roomId: String!, agentId: String!): Assignment!
    addMultipleAgents(agents: [NewAgentInput!]!): MessageResponse!
  }

  type Subscription {
    agentAssigned: Assignment
  }

  input NewAgentInput {
    id: String!
    name: String!
  }

  type MessageResponse {
    message: String!
  }
`;

export default typeDefs;
