import {
  ContentTypeActions,
  type ActionsContent,
} from "../types/ActionsContent.js";

export interface WelcomeConfig {
  groupId: string;
  groupName: string;
  contractAddress: string;
  customMessage?: string;
  showFeatures?: boolean;
  showCommands?: boolean;
}

export class WelcomeManager {
  private welcomeConfigs = new Map<string, WelcomeConfig>();
  private sentWelcomes = new Set<string>(); // Track sent welcomes to avoid duplicates

  /**
   * Configure welcome message for a group
   */
  setWelcomeConfig(groupId: string, config: WelcomeConfig): void {
    this.welcomeConfigs.set(groupId, config);
  }

  /**
   * Generate welcome message with inline actions for new group members
   */
  async createWelcomeMessage(
    groupId: string,
    memberInboxId: string,
  ): Promise<ActionsContent> {
    const config = this.welcomeConfigs.get(groupId);
    const welcomeId = `${groupId}-${memberInboxId}`;

    // Prevent duplicate welcomes
    if (this.sentWelcomes.has(welcomeId)) {
      throw new Error("Welcome already sent to this member");
    }

    const groupName = config?.groupName || "Premium Group";
    const customMessage = config?.customMessage;

    const description =
      customMessage ||
      `🎉 Welcome to ${groupName}!

You now have premium access to this exclusive community. Your NFT access token ensures secure, time-bound membership.

💎 Premium Benefits:
• Exclusive group discussions
• Premium content access
• Community networking opportunities
• Token-gated privileges

⏰ Access Management: Use the buttons below to manage your membership.

Welcome to the community! 🚀`;

    const actions: ActionsContent["actions"] = [
      {
        id: "view-my-tokens",
        label: "🎫 My Access Tokens",
        style: "primary",
      },
      {
        id: "group-info",
        label: "ℹ️ Group Info",
        style: "secondary",
      },
    ];

    // Add group-specific actions if configured
    if (config?.showCommands) {
      actions.push({
        id: "show-commands",
        label: "📖 Available Commands",
        style: "secondary",
      });
    }

    if (config?.showFeatures) {
      actions.push({
        id: "show-features",
        label: "✨ Premium Features",
        style: "secondary",
      });
    }

    // Mark as sent
    this.sentWelcomes.add(welcomeId);

    return {
      id: `welcome-${Date.now()}`,
      description,
      actions,
    };
  }

  /**
   * Create onboarding flow for new group creators
   */
  createCreatorOnboarding(): ActionsContent {
    return {
      id: `creator-onboarding-${Date.now()}`,
      description: `🎉 Congratulations on creating your premium group!

Your group is now live with NFT-based access control. Here's what you can do next:

🔧 Setup Process:
1. Configure pricing tiers
2. Set custom NFT images
3. Define access durations
4. Start monetizing!

Choose your next step:`,
      actions: [
        {
          id: "setup-tiers",
          label: "⚙️ Setup Pricing Tiers",
          style: "primary",
        },
        {
          id: "customize-nfts",
          label: "🎨 Customize NFT Images",
          style: "primary",
        },
        {
          id: "view-analytics",
          label: "📊 View Analytics",
          style: "secondary",
        },
        {
          id: "setup-lottery",
          label: "🎰 Setup Lottery",
          style: "primary",
        },
        {
          id: "creator-guide",
          label: "📖 Creator Guide",
          style: "secondary",
        },
      ],
    };
  }

  /**
   * Create help message with interactive actions
   */
  createHelpMessage(): ActionsContent {
    return {
      id: `help-${Date.now()}`,
      description: `🤖 XMTPAuth Agent

Create and monetize premium XMTP groups with time-bound NFT access tokens on Base network.

Key Features:
• 💰 USDC/ETH payments
• ⏰ Time-bound access
• 🎨 Custom NFT artwork
• 📊 Revenue analytics
• 🔐 Secure token-gating

Quick Actions:`,
      actions: [
        {
          id: "create-group",
          label: "🏗️ Create Premium Group",
          style: "primary",
        },
        {
          id: "list-groups",
          label: "📋 My Groups",
          style: "primary",
        },
        {
          id: "buy-access",
          label: "💰 Buy Access",
          style: "primary",
        },
        {
          id: "my-tokens",
          label: "🎫 My Tokens",
          style: "secondary",
        },
        {
          id: "more-commands",
          label: "📖 All Commands",
          style: "secondary",
        },
      ],
    };
  }

  /**
   * Create feature showcase message
   */
  createFeatureShowcase(): ActionsContent {
    return {
      id: `features-${Date.now()}`,
      description: `✨ Premium Features Overview

🏗️ Group Creation:
• One-click premium group deployment
• 0.001 ETH deployment fee
• Automatic smart contract setup

💰 Monetization:
• Custom USD pricing (e.g., $5.99/month)
• USDC payments on Base network
• Automatic revenue distribution

🎨 Customization:
• Upload custom NFT artwork
• IPFS metadata storage
• OpenSea-compatible tokens

🔐 Access Control:
• Time-bound NFT tokens
• Automatic expiry management
• Smart wallet support

📊 Analytics:
• Revenue tracking
• Member analytics
• Payment monitoring`,
      actions: [
        {
          id: "create-group",
          label: "🚀 Get Started",
          style: "primary",
        },
        {
          id: "help",
          label: "🏠 Main Menu",
          style: "secondary",
        },
      ],
    };
  }

  /**
   * Create command reference message
   */
  createCommandReference(): ActionsContent {
    return {
      id: `commands-${Date.now()}`,
      description: `📖 Available Commands

Group Management:
• /create-group <name> - Create premium group
• /list-groups - View your groups
• /group-info <id> - Group details

Access Control:
• /buy-access <group> <tier> - Purchase access
• /grant-trial <group> <user> <days> - Grant trial
• /my-tokens - View access tokens

Monetization:
• /setup-tiers <group> - Configure pricing
• /withdraw <contract> - Withdraw earnings
• /check-payments - Payment status

Utilities:
• /help - Show main menu
• /test-expiration - Test token system`,
      actions: [
        {
          id: "help",
          label: "🏠 Main Menu",
          style: "primary",
        },
        {
          id: "create-group",
          label: "🏗️ Create Group",
          style: "secondary",
        },
      ],
    };
  }

  /**
   * Check if welcome was already sent
   */
  wasWelcomeSent(groupId: string, memberInboxId: string): boolean {
    return this.sentWelcomes.has(`${groupId}-${memberInboxId}`);
  }

  /**
   * Reset welcome tracking (for testing)
   */
  resetWelcomeTracking(): void {
    this.sentWelcomes.clear();
  }

  /**
   * Get welcome config for a group
   */
  getWelcomeConfig(groupId: string): WelcomeConfig | undefined {
    return this.welcomeConfigs.get(groupId);
  }

  /**
   * Remove welcome config
   */
  removeWelcomeConfig(groupId: string): void {
    this.welcomeConfigs.delete(groupId);
  }
}
