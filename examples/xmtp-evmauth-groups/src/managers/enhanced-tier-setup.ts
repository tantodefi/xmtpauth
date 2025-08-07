import { USDCHandler } from "../handlers/usdc-handler";
import { IPFSMetadataHandler } from "../handlers/ipfs-metadata";
import type { AccessTier } from "../types/types";

export interface TierSetupSession {
  groupId: string;
  creatorInboxId: string;
  step: 'start' | 'tier_count' | 'tier_details' | 'image_upload' | 'confirm' | 'complete';
  currentTierIndex: number;
  totalTiers: number;
  tiers: Partial<AccessTier>[];
  pendingAttachments: Map<number, { data: Uint8Array; filename: string }>;
}

export class EnhancedTierSetup {
  private sessions = new Map<string, TierSetupSession>();
  private usdcHandler: USDCHandler;
  private ipfsHandler: IPFSMetadataHandler;

  constructor(usdcHandler: USDCHandler, ipfsHandler: IPFSMetadataHandler) {
    this.usdcHandler = usdcHandler;
    this.ipfsHandler = ipfsHandler;
  }

  /**
   * Start interactive tier setup
   */
  async startTierSetup(
    groupId: string,
    creatorInboxId: string,
    conversation: any
  ): Promise<void> {
    // Initialize session
    const session: TierSetupSession = {
      groupId,
      creatorInboxId,
      step: 'start',
      currentTierIndex: 0,
      totalTiers: 0,
      tiers: [],
      pendingAttachments: new Map(),
    };

    this.sessions.set(creatorInboxId, session);

    await conversation.send(
      `🎯 TIER SETUP - ${groupId}\n\n` +
      `Let's create your custom access tiers with USDC pricing!\n\n` +
      `STEP 1: How many access tiers do you want?\n` +
      `Choose between 1-5 tiers (e.g., Basic, Premium, VIP)\n\n` +
      `💡 Examples:\n` +
      `• 1 tier: Simple access ($5 for 30 days)\n` +
      `• 3 tiers: Basic ($3/7 days), Premium ($10/30 days), VIP ($25/90 days)\n` +
      `• 5 tiers: Granular options for different budgets\n\n` +
      `Reply with a number (1-5):`
    );

    session.step = 'tier_count';
  }

  /**
   * Handle tier count input
   */
  async handleTierCount(
    creatorInboxId: string,
    input: string,
    conversation: any
  ): Promise<void> {
    const session = this.sessions.get(creatorInboxId);
    if (!session || session.step !== 'tier_count') return;

    const tierCount = parseInt(input.trim());
    if (isNaN(tierCount) || tierCount < 1 || tierCount > 5) {
      await conversation.send(
        `❌ Please enter a valid number between 1 and 5.\n` +
        `You entered: "${input}"`
      );
      return;
    }

    session.totalTiers = tierCount;
    session.tiers = new Array(tierCount).fill({}).map(() => ({}));
    session.step = 'tier_details';
    session.currentTierIndex = 0;

    console.log(`🎯 Moving to tier details step, asking for tier 1 of ${tierCount}`);
    await this.promptTierDetails(session, conversation);
    console.log(`✅ Tier 1 prompt sent successfully`);
  }

  /**
   * Prompt for tier details
   */
  private async promptTierDetails(session: TierSetupSession, conversation: any): Promise<void> {
    const tierIndex = session.currentTierIndex;
    const tierNumber = tierIndex + 1;

    await conversation.send(
      `🏷️ TIER ${tierNumber} of ${session.totalTiers}\n\n` +
      `Please provide the tier details in this format:\n` +
      `Name | Price | Duration\n\n` +
      `📝 Format Examples:\n` +
      `• Basic | $5 | 7 days\n` +
      `• Premium | $15.99 | 30 days\n` +
      `• VIP Access | $50 | 90 days\n\n` +
      `💰 Price: USD amount (e.g., $5, $10.50)\n` +
      `⏰ Duration: Number + "days" (e.g., 7 days, 30 days)\n\n` +
      `Your input:`
    );
  }

  /**
   * Handle tier details input
   */
  async handleTierDetails(
    creatorInboxId: string,
    input: string,
    conversation: any
  ): Promise<void> {
    const session = this.sessions.get(creatorInboxId);
    if (!session || session.step !== 'tier_details') return;

    const tierData = this.parseTierInput(input);
    if (!tierData.valid) {
      await conversation.send(
        `❌ INVALID FORMAT!\n\n` +
        `Error: ${tierData.error}\n\n` +
        `Please use: Name | Price | Duration\n` +
        `Example: Premium | $10 | 30 days`
      );
      return;
    }

    // Store tier data
    const currentTier = session.tiers[session.currentTierIndex];
    Object.assign(currentTier, {
      id: tierData.data!.name.toLowerCase().replace(/\s+/g, '-'),
      name: tierData.data!.name,
      durationDays: tierData.data!.durationDays,
      priceUSD: tierData.data!.priceUSD,
      priceWei: this.usdcHandler.convertUSDToUSDC(tierData.data!.priceUSD).amountUSDC,
      description: `${tierData.data!.durationDays} days of premium access`,
    });

    // Ask for image (with smart fallback explanation)
    await conversation.send(
      `✅ TIER ${session.currentTierIndex + 1} SAVED\n\n` +
      `📋 ${tierData.data!.name}\n` +
      `💰 ${this.usdcHandler.formatPriceDisplay(tierData.data!.priceUSD, tierData.data!.durationDays)}\n\n` +
      `📸 NFT Image (optional):\n` +
      `• Upload a custom image for this tier, OR\n` +
      `• Type: skip (will use your group image)\n\n` +
      `💡 If you skip, the NFT will automatically use your XMTP group's image!\n` +
      `You can always update images later.\n\n` +
      `(We'll continue to tier ${session.currentTierIndex + 2} after this)`
    );

    session.step = 'image_upload';
  }

  /**
   * Handle image upload or skip
   */
  async handleImageUpload(
    creatorInboxId: string,
    input: string,
    conversation: any,
    attachment?: { data: Uint8Array; filename: string }
  ): Promise<void> {
    const session = this.sessions.get(creatorInboxId);
    if (!session || session.step !== 'image_upload') return;

    if (attachment) {
      // Store attachment for later processing
      session.pendingAttachments.set(session.currentTierIndex, attachment);
      await conversation.send(
        `✅ IMAGE UPLOADED for ${session.tiers[session.currentTierIndex].name}\n` +
        `📁 File: ${attachment.filename}\n` +
        `📏 Size: ${attachment && attachment.data ? (attachment.data.length / 1024).toFixed(1) : '0'} KB\n\n` +
        `Image will be processed when you confirm all tiers.`
      );
    } else if (input.toLowerCase().includes('skip') || input.toLowerCase().includes('next')) {
      await conversation.send(
        `⏭️ SKIPPED IMAGE UPLOAD\n` +
        `Default tier image will be used for ${session.tiers[session.currentTierIndex].name}`
      );
    } else {
      await conversation.send(
        `❌ INVALID INPUT\n` +
        `Please upload an image file or type "skip" to continue.`
      );
      return;
    }

    // Move to next tier or confirm
    session.currentTierIndex++;
    
    if (session.currentTierIndex < session.totalTiers) {
      session.step = 'tier_details';
      await this.promptTierDetails(session, conversation);
    } else {
      session.step = 'confirm';
      await this.showTierConfirmation(session, conversation);
    }
  }

  /**
   * Show tier confirmation
   */
  private async showTierConfirmation(session: TierSetupSession, conversation: any): Promise<void> {
    let confirmationText = `🎯 Tier Setup Complete - Please Confirm\n\n`;
    confirmationText += `📊 Group: ${session.groupId}\n`;
    confirmationText += `🎫 Total Tiers: ${session.totalTiers}\n\n`;

    session.tiers.forEach((tier, index) => {
      const hasImage = session.pendingAttachments.has(index) ? " 🖼️" : " 🔲";
      confirmationText += `${index + 1}. ${tier.name}${hasImage}\n`;
      confirmationText += `   💰 $${tier.priceUSD} USD (${this.usdcHandler.convertUSDToUSDC(tier.priceUSD!).formattedUSDC})\n`;
      confirmationText += `   ⏰ ${tier.durationDays} days access\n\n`;
    });

    confirmationText += `💡 **What happens next:**\n`;
    confirmationText += `1. Images will be uploaded to IPFS\n`;
    confirmationText += `2. NFT metadata will be created\n`;
    confirmationText += `3. Smart contract tiers will be configured\n`;
    confirmationText += `4. Your group will be ready for sales!\n\n`;
    
    confirmationText += `**Commands:**\n`;
    confirmationText += `• Type \`confirm\` to create these tiers\n`;
    confirmationText += `• Type \`cancel\` to start over\n`;
    confirmationText += `• Type \`edit N\` to modify tier N`;

    await conversation.send(confirmationText);
  }

  /**
   * Handle confirmation
   */
  async handleConfirmation(
    creatorInboxId: string,
    input: string,
    conversation: any,
    onComplete: (tiers: AccessTier[]) => Promise<void>
  ): Promise<void> {
    const session = this.sessions.get(creatorInboxId);
    if (!session || session.step !== 'confirm') return;

    const command = input.toLowerCase().trim();

    if (command === 'confirm') {
      await conversation.send(
        `🔄 **Processing Tiers...**\n\n` +
        `This may take a moment:\n` +
        `• Uploading images to IPFS\n` +
        `• Creating NFT metadata\n` +
        `• Configuring smart contracts`
      );

      try {
        const completedTiers = await this.processTiers(session);
        await onComplete(completedTiers);
        
        await conversation.send(
          `🎉 **Tiers Created Successfully!**\n\n` +
          `Your group is now ready to sell access tokens.\n` +
          `Users can purchase with: \`/buy-access ${session.groupId} <tier_id>\``
        );

        // Clean up session
        this.sessions.delete(creatorInboxId);
        
      } catch (error) {
        await conversation.send(
          `❌ **Error Creating Tiers**\n\n` +
          `${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
          `Please try again or contact support.`
        );
      }
    } else if (command === 'cancel') {
      this.sessions.delete(creatorInboxId);
      await conversation.send(`❌ Tier setup cancelled. You can start over anytime.`);
    } else if (command.startsWith('edit ')) {
      const tierNumber = parseInt(command.split(' ')[1]);
      if (tierNumber >= 1 && tierNumber <= session.totalTiers) {
        session.currentTierIndex = tierNumber - 1;
        session.step = 'tier_details';
        await this.promptTierDetails(session, conversation);
      } else {
        await conversation.send(`❌ Invalid tier number. Use 1-${session.totalTiers}`);
      }
    } else {
      await conversation.send(
        `❌ **Invalid command**\n\n` +
        `Please type:\n` +
        `• \`confirm\` to create tiers\n` +
        `• \`cancel\` to cancel\n` +
        `• \`edit N\` to modify tier N`
      );
    }
  }

  /**
   * Process tiers with IPFS uploads
   */
  private async processTiers(session: TierSetupSession): Promise<AccessTier[]> {
    const completedTiers: AccessTier[] = [];

    for (let i = 0; i < session.tiers.length; i++) {
      const tier = session.tiers[i];
      const attachment = session.pendingAttachments.get(i);

      // Create tier with metadata
      const result = await this.ipfsHandler.createTierWithMetadata(
        `Group ${session.groupId}`, // Group name - in production, get from group config
        session.groupId,
        tier.name!,
        tier.durationDays!,
        tier.priceUSD!,
        session.creatorInboxId, // Creator address - in production, get actual address
        attachment
      );

      completedTiers.push({
        id: tier.id!,
        name: tier.name!,
        durationDays: tier.durationDays!,
        priceWei: tier.priceWei!,
        description: tier.description!,
        imageUrl: result.imageIPFSHash ? `https://ipfs.io/ipfs/${result.imageIPFSHash}` : undefined,
        metadata: {
          ipfsHash: result.metadataIPFSHash,
          imageHash: result.imageIPFSHash,
        },
      } as AccessTier);
    }

    return completedTiers;
  }

  /**
   * Parse tier input format: "Name | Price | Duration"
   */
  private parseTierInput(input: string): {
    valid: boolean;
    error?: string;
    data?: {
      name: string;
      priceUSD: number;
      durationDays: number;
    };
  } {
    try {
      const parts = input.split('|').map(p => p.trim());
      
      if (parts.length !== 3) {
        return {
          valid: false,
          error: 'Please use format: Name | Price | Duration'
        };
      }

      const [name, priceStr, durationStr] = parts;

      // Validate name
      if (!name || name.length < 2) {
        return {
          valid: false,
          error: 'Tier name must be at least 2 characters'
        };
      }

      // Parse price
      const priceUSD = this.usdcHandler.parseUSDInput(priceStr);
      if (!priceUSD) {
        return {
          valid: false,
          error: 'Invalid price format. Use: $5 or 5.99'
        };
      }

      const priceValidation = this.usdcHandler.validateUSDAmount(priceUSD);
      if (!priceValidation.valid) {
        return {
          valid: false,
          error: priceValidation.error
        };
      }

      // Parse duration
      const durationMatch = durationStr.match(/(\d+)\s*days?/i);
      if (!durationMatch) {
        return {
          valid: false,
          error: 'Invalid duration format. Use: 7 days or 30 days'
        };
      }

      const durationDays = parseInt(durationMatch[1]);
      if (durationDays < 1 || durationDays > 365) {
        return {
          valid: false,
          error: 'Duration must be between 1 and 365 days'
        };
      }

      return {
        valid: true,
        data: {
          name,
          priceUSD,
          durationDays,
        }
      };

    } catch (error) {
      return {
        valid: false,
        error: 'Failed to parse input. Please check format.'
      };
    }
  }

  /**
   * Get active session for user
   */
  getSession(creatorInboxId: string): TierSetupSession | undefined {
    return this.sessions.get(creatorInboxId);
  }

  /**
   * Handle any tier setup message
   */
  async handleTierSetupMessage(
    creatorInboxId: string,
    message: string,
    conversation: any,
    attachment?: { data: Uint8Array; filename: string },
    onComplete?: (tiers: AccessTier[]) => Promise<void>
  ): Promise<boolean> {
    const session = this.getSession(creatorInboxId);
    console.log(`🔍 TierSetup.handleMessage: "${message}" from ${creatorInboxId}`);
    console.log(`📋 Session found: ${session ? 'YES' : 'NO'}`);
    
    if (!session) {
      console.log(`❌ No tier setup session for ${creatorInboxId}`);
      return false;
    }

    console.log(`📊 Session step: ${session.step}, currentTier: ${session.currentTierIndex}/${session.totalTiers}`);

    try {
      switch (session.step) {
        case 'tier_count':
          console.log(`🔢 Processing tier count: ${message}`);
          await this.handleTierCount(creatorInboxId, message, conversation);
          break;
        case 'tier_details':
          console.log(`🏷️ Processing tier details: ${message}`);
          await this.handleTierDetails(creatorInboxId, message, conversation);
          break;
        case 'image_upload':
          console.log(`📸 Processing image upload: ${message}`);
          await this.handleImageUpload(creatorInboxId, message, conversation, attachment);
          break;
        case 'confirm':
          console.log(`✅ Processing confirmation: ${message}`);
          if (onComplete) {
            await this.handleConfirmation(creatorInboxId, message, conversation, onComplete);
          }
          break;
        default:
          console.log(`❌ Unknown step: ${session.step}`);
          return false;
      }

      console.log(`✅ Tier setup message handled successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Error in handleTierSetupMessage:`, error);
      await conversation.send(`❌ Error processing tier setup: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}