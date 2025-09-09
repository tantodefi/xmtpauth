// Test MegaPot API integration
import { config } from "dotenv";

config();

async function testMegaPotAPI() {
  const apiKey = process.env.MEGAPOT_DATA_API_KEY;
  if (!apiKey) {
    console.log("❌ MEGAPOT_DATA_API_KEY not set");
    return;
  }

  if (apiKey === "your_megapot_data_api_key_here") {
    console.log("❌ MEGAPOT_DATA_API_KEY is still placeholder value");
    return;
  }

  try {
    console.log("🔑 Testing MegaPot API key...");

    // Test jackpot stats endpoint
    const jackpotResponse = await fetch(
      `https://api.megapot.io/api/v1/jackpot-round-stats/active?apikey=${apiKey}`,
      { headers: { Accept: "application/json" } },
    );

    if (jackpotResponse.ok) {
      const jackpotData = await jackpotResponse.json();
      console.log("✅ Jackpot API works!");
      console.log("📊 Current jackpot:", jackpotData.prizeUsd);
      console.log("⏰ End timestamp:", jackpotData.endTimestamp);
      console.log("🎫 Ticket price:", jackpotData.ticketPrice);

      // Test timestamp parsing
      console.log("🔍 Raw endTimestamp:", jackpotData.endTimestamp);
      console.log("🔍 Type:", typeof jackpotData.endTimestamp);

      let endTime;
      try {
        // API returns timestamp as string, convert to number
        const timestamp = parseInt(jackpotData.endTimestamp);
        endTime = new Date(timestamp);

        console.log("📅 Parsed end time:", endTime.toISOString());
        console.log(
          "⏰ Time until end:",
          Math.floor((endTime.getTime() - Date.now()) / (1000 * 60 * 60)),
          "hours",
        );
      } catch (error) {
        console.log("❌ Timestamp parsing error:", error.message);
        console.log("🔍 Raw timestamp:", jackpotData.endTimestamp);
        console.log("🔍 Timestamp type:", typeof jackpotData.endTimestamp);
      }

      // Test user ticket history (if we have a test address)
      const testAddress = "0x6529b0f882b209a1918fa6935a40c224611cc510"; // Example address
      const ticketResponse = await fetch(
        `https://api.megapot.io/api/v1/ticket-purchases/${testAddress}?apikey=${apiKey}`,
        { headers: { Accept: "application/json" } },
      );

      if (ticketResponse.ok) {
        const ticketData = await ticketResponse.json();
        console.log(
          `✅ Ticket history API works! Found ${ticketData.length} purchases`,
        );
        if (ticketData.length > 0) {
          console.log("🎫 Sample purchase:", ticketData[0]);
        }
      } else {
        console.log("⚠️ Ticket history API returned:", ticketResponse.status);
      }
    } else {
      console.log("❌ Jackpot API failed with status:", jackpotResponse.status);
      const errorText = await jackpotResponse.text();
      console.log("❌ Error:", errorText);
    }
  } catch (error) {
    console.log("❌ API test failed:", error.message);
  }
}

testMegaPotAPI();
