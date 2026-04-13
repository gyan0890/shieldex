import OpenAI from "openai";
import { callSorobanPay, type PayResult } from "@/lib/soroban";

// Venice AI uses an OpenAI-compatible API — just point to their base URL
const client = new OpenAI({
  apiKey: process.env.VENICE_API_KEY ?? "",
  baseURL: "https://api.venice.ai/api/v1",
});

// mistral-small-2603 has the most reliable multi-round tool_calls on Venice
const MODEL = "mistral-small-2603";

// The one whitelisted payment destination in the on-chain policy.
// .trim() is critical — bash here-strings (<<<) add a trailing \n to Vercel env vars
// which causes Address.fromString() to throw "invalid address".
const AGENT_RECIPIENT = (
  process.env.NEXT_PUBLIC_AGENT_RECIPIENT ??
  "GBTPELPBLNHYSFX6EIIMTMOVH62R5RDN2CEQB5D62WOXULVMJUGVV5JN"
).trim();

// ── ShieldEx payment call ──────────────────────────────────────────────────────
// Calls Soroban directly (no HTTP round-trip) — works on Vercel serverless.
async function callShieldExPay(
  amount: number,
  reason: string
): Promise<PayResult> {
  try {
    return await callSorobanPay(amount, AGENT_RECIPIENT, reason);
  } catch (err) {
    console.warn("[ShieldEx] Payment call failed:", err);
    return {
      status: "rejected",
      rejection_code: "SOROBAN_ERROR",
      reason: String(err),
    };
  }
}

// Travel tool definitions — OpenAI function-calling format
const travelTools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_flights",
      description:
        "Search for available flights between two cities. Returns flight options with prices, airlines, and durations.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Origin city or airport code" },
          destination: { type: "string", description: "Destination city or airport code" },
          date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
          return_date: { type: "string", description: "Return date for round trips (YYYY-MM-DD)" },
          passengers: { type: "number", description: "Number of passengers" },
        },
        required: ["origin", "destination", "date", "passengers"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_hotels",
      description:
        "Search for available hotels at a destination. Returns hotels with ratings, amenities, and nightly rates.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City to search hotels in" },
          check_in: { type: "string", description: "Check-in date (YYYY-MM-DD)" },
          check_out: { type: "string", description: "Check-out date (YYYY-MM-DD)" },
          guests: { type: "number", description: "Number of guests" },
          max_price_per_night: { type: "number", description: "Maximum price per night in USD" },
        },
        required: ["city", "check_in", "check_out", "guests"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather_forecast",
      description:
        "Get weather forecast for a city during specified dates. Returns temperature, conditions, and packing recommendations.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
        required: ["city", "start_date", "end_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_activities",
      description: "Find tourist activities, attractions, and experiences at a destination.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          interests: { type: "string", description: "Types of activities (e.g., food, art, outdoor, nightlife)" },
          budget_per_person: { type: "number", description: "Budget per person per day in USD" },
        },
        required: ["city", "interests"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_restaurants",
      description: "Find top-rated restaurants at the destination based on cuisine preferences and budget.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          cuisine_type: { type: "string", description: "Preferred cuisine type" },
          price_range: {
            type: "string",
            enum: ["budget", "mid-range", "fine-dining"],
            description: "Price range preference",
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_visa_requirements",
      description: "Check visa and entry requirements for traveling from one country to another.",
      parameters: {
        type: "object",
        properties: {
          from_country: { type: "string", description: "Traveler's home country" },
          to_country: { type: "string", description: "Destination country" },
        },
        required: ["from_country", "to_country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_budget_breakdown",
      description:
        "Calculate a detailed budget breakdown for the entire trip including flights, hotels, activities, and food.",
      parameters: {
        type: "object",
        properties: {
          total_budget: { type: "number", description: "Total budget in USD" },
          num_days: { type: "number", description: "Number of days" },
          num_travelers: { type: "number", description: "Number of travelers" },
          destination: { type: "string", description: "Destination city" },
        },
        required: ["total_budget", "num_days", "num_travelers", "destination"],
      },
    },
  },
];

// Tool cost map — USDC amount charged per API call (all ≤ 0.20 USDC max_per_tx)
const TOOL_COST: Record<string, number> = {
  search_flights: 0.018,
  search_hotels: 0.012,
  get_weather_forecast: 0.005,
  search_activities: 0.009,
  search_restaurants: 0.006,
  check_visa_requirements: 0.004,
  calculate_budget_breakdown: 0.001,
};

// Simulated tool responses — realistic data the agent "discovers"
function executeTool(name: string, input: Record<string, unknown>): string {
  const to = String(input.destination || input.city || input.to_country || "");
  const city = to.split(",")[0].trim();

  switch (name) {
    case "search_flights":
      return JSON.stringify({
        status: "success",
        api_provider: "SkyScanner Pro API",
        cost_usd: TOOL_COST.search_flights,
        results: [
          {
            airline: "ANA Airways",
            flight: "NH011",
            departure: "JFK 11:55",
            arrival: `${city} 15:35+1`,
            duration: "14h 40m",
            price_per_person: 847,
            class: "Economy",
            stops: 0,
          },
          {
            airline: "Japan Airlines",
            flight: "JL004",
            departure: "JFK 13:00",
            arrival: `${city} 17:30+1`,
            duration: "14h 30m",
            price_per_person: 912,
            class: "Economy",
            stops: 0,
          },
          {
            airline: "United Airlines",
            flight: "UA837",
            departure: "JFK 10:30",
            arrival: `${city} 14:55+1`,
            duration: "14h 25m",
            price_per_person: 769,
            class: "Economy",
            stops: 1,
            layover: "Chicago O'Hare, 2h15m",
          },
        ],
        best_value: "UA837 at $769/person (with layover)",
      });

    case "search_hotels":
      return JSON.stringify({
        status: "success",
        api_provider: "Booking.com Affiliate API",
        cost_usd: TOOL_COST.search_hotels,
        results: [
          {
            name: `${city} Grand Hotel`,
            stars: 4,
            rating: 8.7,
            price_per_night: 145,
            amenities: ["WiFi", "Pool", "Breakfast included", "City view"],
            location: "City Center",
          },
          {
            name: `${city} Boutique Inn`,
            stars: 3,
            rating: 9.1,
            price_per_night: 89,
            amenities: ["WiFi", "Breakfast included", "Near subway"],
            location: "Shibuya District",
          },
          {
            name: `The ${city} Plaza`,
            stars: 5,
            rating: 9.4,
            price_per_night: 289,
            amenities: ["WiFi", "Spa", "Pool", "Concierge", "Fine dining"],
            location: "Premium District",
          },
        ],
        recommended: `${city} Boutique Inn — best value/rating ratio`,
      });

    case "get_weather_forecast":
      return JSON.stringify({
        status: "success",
        api_provider: "WeatherAPI Pro",
        cost_usd: TOOL_COST.get_weather_forecast,
        forecast: {
          avg_temp_c: 22,
          avg_temp_f: 72,
          conditions: "Partly cloudy with occasional sunshine",
          rain_probability: "30%",
          humidity: "65%",
          summary: "Pleasant weather — light jacket recommended for evenings",
          packing_tips: ["Light layers", "Comfortable walking shoes", "Small umbrella", "Sunscreen"],
        },
      });

    case "search_activities":
      return JSON.stringify({
        status: "success",
        api_provider: "Viator Activities API",
        cost_usd: TOOL_COST.search_activities,
        activities: [
          { name: `${city} City Walking Tour`, price: 25, duration: "3 hours", rating: 4.8 },
          { name: "Local Street Food Tour", price: 45, duration: "2.5 hours", rating: 4.9 },
          { name: "Traditional Cultural Experience", price: 60, duration: "4 hours", rating: 4.7 },
          { name: "Day Trip to Surrounding Areas", price: 85, duration: "Full day", rating: 4.6 },
          { name: "Nightlife & Entertainment", price: 30, duration: "Evening", rating: 4.5 },
        ],
        estimated_daily_activities_budget: "$50-120 per person",
      });

    case "search_restaurants":
      return JSON.stringify({
        status: "success",
        api_provider: "Yelp Fusion API",
        cost_usd: TOOL_COST.search_restaurants,
        restaurants: [
          { name: "Sakura Garden", cuisine: "Local Traditional", avg_cost: 25, rating: 4.7, must_try: "Signature tasting menu" },
          { name: "The Night Market", cuisine: "Street Food", avg_cost: 10, rating: 4.8, must_try: "Grilled skewers & dumplings" },
          { name: "Zen & Co.", cuisine: "Fusion", avg_cost: 45, rating: 4.5, must_try: "Chef's omakase" },
          { name: "Harbor View", cuisine: "Seafood", avg_cost: 60, rating: 4.6, must_try: "Fresh catch of the day" },
        ],
        food_budget_estimate: "$35-60 per person per day",
      });

    case "check_visa_requirements":
      return JSON.stringify({
        status: "success",
        api_provider: "IATA Travel Centre API",
        cost_usd: TOOL_COST.check_visa_requirements,
        requirements: {
          visa_required: false,
          visa_on_arrival: false,
          visa_free_duration: "90 days",
          passport_validity: "Must be valid for at least 6 months",
          required_documents: ["Valid passport", "Return ticket", "Proof of accommodation", "Sufficient funds"],
          notes: "No visa required for US citizens for tourist stays up to 90 days",
        },
      });

    case "calculate_budget_breakdown": {
      const budget = Number(input.total_budget) || 2000;
      const days = Number(input.num_days) || 7;
      const travelers = Number(input.num_travelers) || 1;
      return JSON.stringify({
        status: "success",
        api_provider: "Internal Budget Calculator",
        cost_usd: TOOL_COST.calculate_budget_breakdown,
        breakdown: {
          flights: Math.round(budget * 0.4),
          accommodation: Math.round(budget * 0.3),
          activities: Math.round(budget * 0.15),
          food: Math.round(budget * 0.1),
          transport_local: Math.round(budget * 0.03),
          miscellaneous: Math.round(budget * 0.02),
          per_day_budget: Math.round(budget / days),
          per_person_per_day: Math.round(budget / days / travelers),
        },
        currency: "USD",
        feasibility:
          budget >= 1500
            ? "Comfortable trip possible"
            : "Budget trip possible with careful planning",
      });
    }

    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

export async function POST(req: Request) {
  const { from, to, startDate, endDate, budget, travelers, interests } =
    await req.json();

  const numDays =
    startDate && endDate
      ? Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 7;

  const systemPrompt = `You are an autonomous AI travel planning agent. You help users plan complete trips by calling specialized travel APIs (tools) to gather real-time data.

Your job is to:
1. Systematically research the trip using the available tools
2. Call tools in a logical order: visa requirements → flights → weather → hotels → activities → restaurants → budget
3. Use ALL relevant tools to build a comprehensive picture
4. After gathering data, write a complete, well-structured travel plan

Be thorough — call multiple tools, gather real information, then synthesize it into an actionable itinerary.`;

  const userMessage = `Plan a trip for ${travelers} traveler(s):
- From: ${from}
- To: ${to}
- Dates: ${startDate} to ${endDate} (${numDays} days)
- Budget: $${budget} USD total
- Interests: ${interests || "general sightseeing, food, culture"}

Please research this trip thoroughly using all available tools, then create a complete day-by-day itinerary.`;

  // OpenAI-compatible message history
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Agentic loop — keep going until model stops calling tools
        while (true) {
          const response = await client.chat.completions.create({
            model: MODEL,
            max_tokens: 8192,
            tools: travelTools,
            tool_choice: "auto",
            messages,
          });

          const choice = response.choices[0];
          const message = choice.message;

          // Stream any text content immediately
          if (message.content?.trim()) {
            send({ type: "text", text: message.content });
          }

          // If done (no tool calls), break.
          // Some Venice models fall back to text-format "<function=name={...}>" syntax
          // when finish_reason is "stop" — treat that as a normal text completion.
          if (choice.finish_reason === "stop" || !message.tool_calls?.length) {
            send({ type: "done" });
            break;
          }

          // Add the assistant message (with tool_calls) to history
          messages.push(message);

          // Execute each tool + call ShieldEx middleware for payment
          const functionToolCalls = (
            message.tool_calls as OpenAI.Chat.ChatCompletionMessageToolCall[]
          ).filter((tc) => tc.type === "function");
          for (const toolCall of functionToolCalls) {
            const toolName = toolCall.function.name;
            const toolInput = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
            const toolCost = TOOL_COST[toolName] ?? 0.005;

            // Stream tool call start
            send({
              type: "tool_call",
              tool: toolName,
              input: toolInput,
              id: toolCall.id,
              cost: toolCost,
            });

            // Execute tool (simulated API data)
            await new Promise((r) => setTimeout(r, 300));
            const result = executeTool(toolName, toolInput);
            const parsedResult = JSON.parse(result) as Record<string, unknown>;

            // ── ShieldEx on-chain payment ──────────────────────────────────
            const payReason = `${toolName.replace(/_/g, " ")} for trip to ${to}`;
            const payResult = await callShieldExPay(toolCost, payReason);

            // Stream tool result with payment proof
            send({
              type: "tool_result",
              tool: toolName,
              id: toolCall.id,
              result: parsedResult,
              cost: toolCost,
              provider: parsedResult.api_provider as string,
              payment: {
                status: payResult.status,
                tx_hash: payResult.tx_hash,
                nullifier_hash: payResult.nullifier_hash,
                rejection_code: payResult.rejection_code,
                daily_spent: payResult.daily_spent,
                daily_remaining: payResult.daily_remaining,
              },
            });

            // Add tool result to message history (OpenAI "tool" role)
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        }
      } catch (err) {
        console.error("Plan API error:", err);
        send({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
