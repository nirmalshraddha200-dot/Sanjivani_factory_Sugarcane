
import "dotenv/config";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error(
    "Missing OPENAI_API_KEY. Export it in your shell or add it to a .env file before running this client."
  );
  process.exit(1);
}

const ai = new OpenAI({ apiKey });

async function main() {
  const mcp = new Client({
    name: "sanjivani-farmer-client",
    version: "1.0.0",
  });

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "server.ts"],
  });

  await mcp.connect(transport);

  try {
    // Discover the tool registered by the MCP server
    const { tools } = await mcp.listTools();

    console.log("MCP tools:", tools.map(t => t.name));

    // Pass the discovered MCP tool to OpenAI
    const openAITools = tools.map(tool => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema as Record<string, unknown>,
      strict: false,
    }));

    // Your question is hardcoded here
    const question =
      "Compare the average sugarcane supplied by farmers from each village and identify the leading village.";

    let response = await ai.responses.create({
      model: "gpt-4.1-mini",
      input: question,
      tools: openAITools as any,
      tool_choice: "required",
    });

    // Execute any function calls requested by OpenAI
    while (true) {
      const calls = response.output.filter(
        item => item.type === "function_call"
      );

      if (calls.length === 0) break;

      const outputs = [];

      for (const call of calls) {
        if (call.name !== "get_farmer_data") {
          throw new Error(`Unknown tool: ${call.name}`);
        }

        const args = JSON.parse(call.arguments);

        const result = await mcp.callTool({
          name: call.name,
          arguments: args,
        });

        outputs.push({
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: JSON.stringify(result.content),
        });
      }

      response = await ai.responses.create({
        model: "gpt-4.1-mini",
        previous_response_id: response.id,
        input: outputs,
        tools: openAITools as any,
      });
    }

    console.log("\nAI ANSWER:\n", response.output_text);
  } finally {
    await mcp.close();
  }
}

main().catch(console.error);
