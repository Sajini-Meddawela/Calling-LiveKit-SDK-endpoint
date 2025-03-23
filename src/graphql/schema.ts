const typeDefs = `#graphql
  type Assignment {
    agentId: String!
    roomId: String!
    token: String!
  }

  input RouteToAgentInput {
    roomId: String!
    session: String!
    agentType: String!
    department: String!
    languages: [String!]!
  }

  type Query {
    getRoomToken(roomId: String!, agentId: String!): Assignment!
  }

  type Mutation {
    routeToAgent(input: RouteToAgentInput!): Assignment!
  }

  type Subscription {
    agentAssigned(department: String!, languages: [String!]!): Assignment!
  }
`;

export default typeDefs;