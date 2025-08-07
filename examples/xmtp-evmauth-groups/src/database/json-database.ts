/**
 * Simple JSON Database for Group Management
 * Prevents duplicates and provides persistence
 */

import fs from 'fs';
import path from 'path';

export interface GroupRecord {
  id: string;
  name: string;
  creatorInboxId: string;
  creatorAddress: string;
  contractAddress: string;
  salesGroupId: string;
  premiumGroupId: string;
  status: 'created' | 'tiers_setup' | 'active';
  createdAt: string;
  updatedAt: string;
  tiers?: AccessTierRecord[];
}

export interface AccessTierRecord {
  id: number;
  name: string;
  priceUsd: number;
  durationDays: number;
  imageUrl?: string;
  metadataUri?: string;
}

export interface TierSession {
  userInboxId: string;
  contractAddress: string;
  step: string;
  currentTierIndex: number;
  totalTiers: number;
  tiers: any[];
  pendingAttachments: Record<number, any>;
  createdAt: string;
}

interface DatabaseSchema {
  groups: GroupRecord[];
  tierSessions: TierSession[];
  lastScannedBlock: number;
  version: string;
}

export class JSONDatabase {
  private dbPath: string;
  private data: DatabaseSchema;

  constructor(dataDir: string = './.data') {
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.dbPath = path.join(dataDir, 'groups-database.json');
    this.loadDatabase();
  }

  private loadDatabase(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const rawData = fs.readFileSync(this.dbPath, 'utf8');
        this.data = JSON.parse(rawData);
        console.log(`📋 Loaded database: ${this.data.groups.length} groups, ${this.data.tierSessions.length} sessions`);
      } else {
        this.data = {
          groups: [],
          tierSessions: [],
          lastScannedBlock: 0,
          version: '1.0.0'
        };
        this.saveDatabase();
      }
    } catch (error) {
      console.error('Error loading database:', error);
      this.data = {
        groups: [],
        tierSessions: [],
        lastScannedBlock: 0,
        version: '1.0.0'
      };
    }
  }

  private saveDatabase(): void {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving database:', error);
    }
  }

  // Group Management
  async createGroup(group: Omit<GroupRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<GroupRecord> {
    const id = `${group.creatorInboxId}-${group.name.toLowerCase()}-${Date.now()}`;
    const now = new Date().toISOString();
    
    const newGroup: GroupRecord = {
      ...group,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.data.groups.push(newGroup);
    this.saveDatabase();
    
    console.log(`📝 Created group record: ${group.name} (${id})`);
    return newGroup;
  }

  async findGroupByName(creatorInboxId: string, groupName: string): Promise<GroupRecord | null> {
    return this.data.groups.find(g => 
      g.creatorInboxId === creatorInboxId && 
      g.name.toLowerCase() === groupName.toLowerCase()
    ) || null;
  }

  async findGroupByContract(contractAddress: string): Promise<GroupRecord | null> {
    return this.data.groups.find(g => g.contractAddress === contractAddress) || null;
  }

  async updateGroup(id: string, updates: Partial<GroupRecord>): Promise<boolean> {
    const index = this.data.groups.findIndex(g => g.id === id);
    if (index === -1) return false;
    
    this.data.groups[index] = {
      ...this.data.groups[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this.saveDatabase();
    return true;
  }

  async getUserGroups(creatorInboxId: string): Promise<GroupRecord[]> {
    return this.data.groups.filter(g => g.creatorInboxId === creatorInboxId);
  }

  async getAllGroups(): Promise<GroupRecord[]> {
    return [...this.data.groups];
  }

  // Tier Session Management
  async saveTierSession(session: TierSession): Promise<void> {
    const existingIndex = this.data.tierSessions.findIndex(s => s.userInboxId === session.userInboxId);
    
    if (existingIndex >= 0) {
      this.data.tierSessions[existingIndex] = session;
    } else {
      this.data.tierSessions.push(session);
    }
    
    this.saveDatabase();
    console.log(`💾 Saved tier session for ${session.userInboxId}`);
  }

  async getTierSession(userInboxId: string): Promise<TierSession | null> {
    return this.data.tierSessions.find(s => s.userInboxId === userInboxId) || null;
  }

  async deleteTierSession(userInboxId: string): Promise<boolean> {
    const index = this.data.tierSessions.findIndex(s => s.userInboxId === userInboxId);
    if (index === -1) return false;
    
    this.data.tierSessions.splice(index, 1);
    this.saveDatabase();
    return true;
  }

  // Cleanup old sessions (older than 24 hours)
  async cleanupOldSessions(): Promise<number> {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    const initialCount = this.data.tierSessions.length;
    
    this.data.tierSessions = this.data.tierSessions.filter(session => {
      const sessionTime = new Date(session.createdAt).getTime();
      return sessionTime > cutoff;
    });
    
    const cleaned = initialCount - this.data.tierSessions.length;
    if (cleaned > 0) {
      this.saveDatabase();
      console.log(`🧹 Cleaned up ${cleaned} old tier sessions`);
    }
    
    return cleaned;
  }

  // Block tracking for efficient recovery
  async updateLastScannedBlock(blockNumber: number): Promise<void> {
    this.data.lastScannedBlock = blockNumber;
    this.saveDatabase();
  }

  async getLastScannedBlock(): Promise<number> {
    return this.data.lastScannedBlock;
  }

  // Statistics
  getStats() {
    return {
      totalGroups: this.data.groups.length,
      activeGroups: this.data.groups.filter(g => g.status === 'active').length,
      pendingSessions: this.data.tierSessions.length,
      lastScannedBlock: this.data.lastScannedBlock
    };
  }
}