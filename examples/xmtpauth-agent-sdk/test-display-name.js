// Quick test for Neynar API display name resolution
import { NeynarAPIClient } from "@neynar/nodejs-sdk";

async function testDisplayName() {
  const neynar = new NeynarAPIClient({
    apiKey: "test_neynar_api_key", // Test key - replace with real key for testing
  });

  const testAddress = "0x6529b0f882b209a1918fa6935a40c224611cc510"; // User's address

  try {
    console.log(`Testing Neynar API with address: ${testAddress}`);
    const allMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(neynar),
    ).filter((name) => typeof neynar[name] === "function");
    console.log("Available methods:", allMethods);

    // Look for methods that might be related to user lookup
    const userMethods = allMethods.filter(
      (name) => name.includes("user") || name.includes("lookup"),
    );
    console.log("User/lookup related methods:", userMethods);

    // Try the available lookup methods
    console.log("\nTrying lookupUserByCustodyAddress with object parameter...");
    try {
      const response = await neynar.lookupUserByCustodyAddress({
        custodyAddress: testAddress,
      });
      console.log(
        "lookupUserByCustodyAddress response:",
        JSON.stringify(response, null, 2),
      );

      if (response.result?.user) {
        const user = response.result.user;
        console.log("User found:", {
          display_name: user.display_name,
          username: user.username,
          fid: user.fid,
        });
      } else {
        console.log("No user found for this custody address");
      }
    } catch (e) {
      console.log("lookupUserByCustodyAddress failed:", e.message);
    }

    console.log("\nTrying lookupUserByCustodyAddress with direct parameter...");
    try {
      const response = await neynar.lookupUserByCustodyAddress(testAddress);
      console.log(
        "lookupUserByCustodyAddress response:",
        JSON.stringify(response, null, 2),
      );
    } catch (e) {
      console.log("lookupUserByCustodyAddress (direct) failed:", e.message);
    }

    console.log("\nTrying lookupUserByUsername with a test username...");
    try {
      const response = await neynar.lookupUserByUsername("test");
      console.log(
        "lookupUserByUsername response:",
        JSON.stringify(response, null, 2),
      );
    } catch (e) {
      console.log("lookupUserByUsername failed:", e.message);
    }
  } catch (error) {
    console.error("API call failed:", error.message);
  }
}

testDisplayName();
