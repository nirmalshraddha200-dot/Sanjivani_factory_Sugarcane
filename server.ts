
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Pool } from "pg";
import * as z from "zod/v4";

// Connect to PostgreSQL using environment variables.
// Set DATABASE_URL or the standard PG* variables before running the server.
const db = new Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}
);

// Create MCP server
const server = new McpServer({
  name: "sanjivani-farmer-server",
  version: "1.0.0",
});

async function ensureFarmersTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS farmers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      village TEXT NOT NULL,
      sugarcane_tons NUMERIC(10, 2) NOT NULL,
      payment_pending NUMERIC(12, 2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0
    )
  `);

  const existing = await db.query("SELECT COUNT(*)::int AS total FROM farmers");

  if (existing.rows[0].total === 0) {
    await db.query(`
      INSERT INTO farmers (name, village, sugarcane_tons, payment_pending, amount_paid)
      VALUES
        ('Kiran Patil', 'Bhor', 18.50, 2200.00, 1200.00),
        ('Arjun Shinde', 'Khed', 24.00, 3100.00, 2000.00),
        ('Meena More', 'Pimpalgaon', 15.75, 0.00, 950.00),
        ('Raju Bhosale', 'Bhor', 21.25, 1750.00, 1600.00)
    `);
  }
}

await ensureFarmersTable();

// Register exactly one MCP tool
server.registerTool(
  "get_farmer_data",
  {
    description:
      "Fetch farmer names, villages, sugarcane supplied in tons, pending payments and amounts paid from the Sanjivani farmers database.",
    inputSchema: z.object({
      question: z
        .string()
        .describe("The farmer information the AI needs to analyze"),
    }),
  },
  async ({ question }) => {
    try {
      const result = await db.query(`
        SELECT
          id,
          name,
          village,
          sugarcane_tons,
          payment_pending,
          amount_paid
        FROM farmers
        ORDER BY id
      `);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              question,
              total_farmers: result.rows.length,
              farmers: result.rows,
            }),
          },
        ],
      };
    } catch (error) {
      console.error(
        "Database query failed. Ensure DATABASE_URL or the PG* variables are set and that the farmers table exists:",
        error
      );

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Failed to fetch farmer data. Check your PostgreSQL connection, environment variables, and the farmers table.",
          },
        ],
      };
    }
  }
);

// Start MCP server over standard input/output
void serveStdio(() => server);
