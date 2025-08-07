/**
 * Persistent State Manager - Prevents duplicate groups and tracks progress
 */

import fs from 'fs';
import path from 'path';

interface GroupRecord {
  groupName: string;
  creatorInboxId: string;
  contractAddress?: string;
  salesGroupId?: string;
  premiumGroupId?: string;
  createdAt: string;
  status: 'payment-pending' | 'deploying' | 'tier-setup' | 'completed';
  paymentHash?: string;
}

export class PersistentStateManager {
  private stateFile: string;
  private groups: Map<string, GroupRecord> = new Map();

  constructor(stateDir: string = './.data') {
    // Ensure state directory exists
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    
    this.stateFile = path.join(stateDir, 'groups-state.json');
    this.loadState();
  }

  /**
   * Load state from disk
   */
  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        const groupsArray: GroupRecord[] = JSON.parse(data);
        
        // Convert array back to Map
        this.groups = new Map();
        groupsArray.forEach(record => {
          const key = `${record.creatorInboxId}-${record.groupName.toLowerCase()}`;
          this.groups.set(key, record);
        });
        
        console.log(`📋 Loaded ${this.groups.size} group records from state`);
      }
    } catch (error) {
      console.error('Error loading persistent state:', error);
      this.groups = new Map();
    }
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    try {
      const groupsArray = Array.from(this.groups.values());
      fs.writeFileSync(this.stateFile, JSON.stringify(groupsArray, null, 2));
    } catch (error) {
      console.error('Error saving persistent state:', error);
    }
  }

  /**
   * Check if a group name already exists for a user
   */
  hasExistingGroup(creatorInboxId: string, groupName: string): GroupRecord | null {
    const key = `${creatorInboxId}-${groupName.toLowerCase()}`;
    return this.groups.get(key) || null;
  }

  /**
   * Register a new group creation attempt
   */
  createGroupRecord(
    creatorInboxId: string, 
    groupName: string, 
    status: 'payment-pending' = 'payment-pending'
  ): GroupRecord {
    const key = `${creatorInboxId}-${groupName.toLowerCase()}`;
    
    const record: GroupRecord = {
      groupName,
      creatorInboxId,
      createdAt: new Date().toISOString(),
      status
    };
    
    this.groups.set(key, record);
    this.saveState();
    
    console.log(`📝 Created group record: ${groupName} for ${creatorInboxId}`);
    return record;
  }

  /**
   * Update group record status and details
   */
  updateGroupRecord(
    creatorInboxId: string,
    groupName: string,
    updates: Partial<GroupRecord>
  ): boolean {
    const key = `${creatorInboxId}-${groupName.toLowerCase()}`;
    const existing = this.groups.get(key);
    
    if (!existing) return false;
    
    // Merge updates
    const updated = { ...existing, ...updates };
    this.groups.set(key, updated);
    this.saveState();
    
    console.log(`📝 Updated group record: ${groupName} - status: ${updated.status}`);
    return true;
  }

  /**
   * Get all groups for a user
   */
  getUserGroups(creatorInboxId: string): GroupRecord[] {
    return Array.from(this.groups.values()).filter(
      record => record.creatorInboxId === creatorInboxId
    );
  }

  /**
   * Get incomplete groups that need attention
   */
  getIncompleteGroups(creatorInboxId: string): GroupRecord[] {
    return this.getUserGroups(creatorInboxId).filter(
      record => record.status !== 'completed'
    );
  }

  /**
   * Clean up old incomplete records (older than 24 hours)
   */
  cleanupOldRecords(): number {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    let cleaned = 0;
    
    for (const [key, record] of this.groups.entries()) {
      const recordTime = new Date(record.createdAt).getTime();
      
      if (recordTime < cutoff && record.status !== 'completed') {
        this.groups.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.saveState();
      console.log(`🧹 Cleaned up ${cleaned} old incomplete group records`);
    }
    
    return cleaned;
  }

  /**
   * Get group by contract address
   */
  getGroupByContract(contractAddress: string): GroupRecord | null {
    for (const record of this.groups.values()) {
      if (record.contractAddress === contractAddress) {
        return record;
      }
    }
    return null;
  }
}