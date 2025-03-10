const typeDefs = `#graphql
  type Assignment {
    agentId: String!
    roomId: String!
    token: String!
  }

  type Query {
    getRoomToken(roomId: String!, agentId: String!): Assignment!
  }

  type Mutation {
    routeToAgent(roomId: String!, agentId: String!): Assignment!
  }

  type Subscription {
    agentAssigned: Assignment
  }
`;

export default typeDefs;
