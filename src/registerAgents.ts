import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });

const agents = [
  { id: "A1", name: "John Doe", department: "customer-service", isAvailable: true },
  { id: "A2", name: "Jane Smith", department: "credit-card", isAvailable: true },
];

async function registerAgents() {
  await redisClient.connect();

  for (const agent of agents) {
    await redisClient.hSet(`agents:${agent.department}`, agent.id, JSON.stringify(agent)); // Change hset → hSet
  }

  console.log("Agents registered in Redis.");
  await redisClient.disconnect();
}

registerAgents();
