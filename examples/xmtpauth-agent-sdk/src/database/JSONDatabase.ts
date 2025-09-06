import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface GroupRecord {
  id: string;
  name: string;
  contractAddress: string;
  creatorInboxId: string;
  creatorAddress: string;
  salesGroupId: string;
  premiumGroupId: string;
  deploymentTxHash: string;
  createdAt: string;
  tiers: TierRecord[];
}

export interface TierRecord {
  id: number;
  name: string;
  description: string;
  durationDays: number;
  priceEth: string;
  priceUsd: number;
  imageHash?: string;
  metadataUri?: string;
  isActive: boolean;
  createdAt: string;
}

export interface DatabaseSchema {
  groups: GroupRecord[];
  version: string;
  lastUpdated: string;
}

export class JSONDatabase {
  private dbPath: string;
  private data: DatabaseSchema;

  constructor(dataDir: string = ".data") {
    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = join(dataDir, "groups-database.json");
    this.loadDatabase();
  }

  private loadDatabase(): void {
    if (existsSync(this.dbPath)) {
      try {
        const fileContent = readFileSync(this.dbPath, "utf-8");
        this.data = JSON.parse(fileContent);

        // Migrate old database if needed
        if (!this.data.version) {
          this.data.version = "1.0.0";
          this.data.lastUpdated = new Date().toISOString();
        }
      } catch (error) {
        console.error("❌ Error loading database, creating new one:", error);
        this.initializeDatabase();
      }
    } else {
      this.initializeDatabase();
    }
  }

  private initializeDatabase(): void {
    this.data = {
      groups: [],
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
    };
    this.saveDatabase();
  }

  private saveDatabase(): void {
    try {
      this.data.lastUpdated = new Date().toISOString();
      writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("❌ Error saving database:", error);
    }
  }

  /**
   * Add a new group record
   */
  async addGroup(
    group: Omit<GroupRecord, "id" | "createdAt">,
  ): Promise<GroupRecord> {
    const newGroup: GroupRecord = {
      ...group,
      id: `${group.contractAddress.slice(2, 10)}-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };

    this.data.groups.push(newGroup);
    this.saveDatabase();

    console.log(
      `📊 Added group to database: ${newGroup.name} (${newGroup.contractAddress})`,
    );
    return newGroup;
  }

  /**
   * Get group by contract address
   */
  async getGroupByContract(
    contractAddress: string,
  ): Promise<GroupRecord | null> {
    const group = this.data.groups.find(
      (g) => g.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
    );
    return group || null;
  }

  /**
   * Get group by contract address (throws if not found)
   */
  async requireGroupByContract(contractAddress: string): Promise<GroupRecord> {
    const group = await this.getGroupByContract(contractAddress);
    if (!group) {
      throw new Error(`Group not found for contract: ${contractAddress}`);
    }
    return group;
  }

  /**
   * Get groups by creator inbox ID
   */
  async getGroupsByCreator(creatorInboxId: string): Promise<GroupRecord[]> {
    return this.data.groups.filter(
      (g) => g.creatorInboxId.toLowerCase() === creatorInboxId.toLowerCase(),
    );
  }

  /**
   * Get all groups
   */
  async getAllGroups(): Promise<GroupRecord[]> {
    return [...this.data.groups];
  }

  /**
   * Update group record
   */
  async updateGroup(
    contractAddress: string,
    updates: Partial<GroupRecord>,
  ): Promise<void> {
    const groupIndex = this.data.groups.findIndex(
      (g) => g.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
    );

    if (groupIndex === -1) {
      throw new Error(`Group not found for contract: ${contractAddress}`);
    }

    this.data.groups[groupIndex] = {
      ...this.data.groups[groupIndex],
      ...updates,
    };

    this.saveDatabase();
    console.log(`📊 Updated group in database: ${contractAddress}`);
  }

  /**
   * Add tier to group
   */
  async addTierToGroup(
    contractAddress: string,
    tier: Omit<TierRecord, "createdAt">,
  ): Promise<void> {
    const group = await this.requireGroupByContract(contractAddress);

    const newTier: TierRecord = {
      ...tier,
      createdAt: new Date().toISOString(),
    };

    group.tiers.push(newTier);
    await this.updateGroup(contractAddress, { tiers: group.tiers });

    console.log(`📊 Added tier to group: ${tier.name} (${contractAddress})`);
  }

  /**
   * Update tier in group
   */
  async updateTier(
    contractAddress: string,
    tierId: number,
    updates: Partial<TierRecord>,
  ): Promise<void> {
    const group = await this.requireGroupByContract(contractAddress);

    const tierIndex = group.tiers.findIndex((t) => t.id === tierId);
    if (tierIndex === -1) {
      throw new Error(`Tier ${tierId} not found in group ${contractAddress}`);
    }

    group.tiers[tierIndex] = {
      ...group.tiers[tierIndex],
      ...updates,
    };

    await this.updateGroup(contractAddress, { tiers: group.tiers });
    console.log(`📊 Updated tier in group: ${tierId} (${contractAddress})`);
  }

  /**
   * Delete group
   */
  async deleteGroup(contractAddress: string): Promise<void> {
    const groupIndex = this.data.groups.findIndex(
      (g) => g.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
    );

    if (groupIndex === -1) {
      throw new Error(`Group not found for contract: ${contractAddress}`);
    }

    const deletedGroup = this.data.groups.splice(groupIndex, 1)[0];
    this.saveDatabase();

    console.log(
      `📊 Deleted group from database: ${deletedGroup.name} (${contractAddress})`,
    );
  }

  /**
   * Get database statistics
   */
  getStats(): { totalGroups: number; totalTiers: number; lastUpdated: string } {
    const totalTiers = this.data.groups.reduce(
      (sum, group) => sum + group.tiers.length,
      0,
    );

    return {
      totalGroups: this.data.groups.length,
      totalTiers,
      lastUpdated: this.data.lastUpdated,
    };
  }

  /**
   * Clean up old sessions (placeholder for compatibility)
   */
  async cleanupOldSessions(): Promise<void> {
    // Remove groups older than 1 year (optional cleanup)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const initialCount = this.data.groups.length;
    this.data.groups = this.data.groups.filter(
      (group) => new Date(group.createdAt) > oneYearAgo,
    );

    const removedCount = initialCount - this.data.groups.length;
    if (removedCount > 0) {
      this.saveDatabase();
      console.log(`🧹 Cleaned up ${removedCount} old group records`);
    }
  }

  /**
   * Export database for backup
   */
  exportDatabase(): DatabaseSchema {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * Import database from backup
   */
  importDatabase(data: DatabaseSchema): void {
    this.data = data;
    this.saveDatabase();
    console.log(`📊 Imported database with ${data.groups.length} groups`);
  }
}
