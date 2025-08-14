import { Client } from '@xmtp/node-sdk';
import { createSigner, getEncryptionKeyFromHex } from '@helpers/client.js';
import { config } from 'dotenv';

config();

const WALLET_KEY = process.env.WALLET_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const XMTP_ENV = process.env.XMTP_ENV || 'dev';

async function checkInboxAddress() {
  try {
    console.log('🔍 Checking inbox ID to address mapping...');
    
    const signer = createSigner(WALLET_KEY);
    const encryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
    
    const client = await Client.create(signer, {
      dbEncryptionKey: encryptionKey,
      env: XMTP_ENV,
    });
    
    // Get recent conversations to find tanto.base.eth's inbox ID
    await client.conversations.sync();
    const conversations = await client.conversations.list();
    
    console.log(`📋 Found ${conversations.length} conversations`);
    
    for (const conversation of conversations) {
      const members = await conversation.members();
      
      for (const member of members) {
        if (member.inboxId !== client.inboxId) {
          console.log(`\n👤 Member: ${member.inboxId}`);
          
          // Get the address for this inbox ID
          const inboxState = await client.preferences.inboxStateFromInboxIds([
            member.inboxId,
          ]);
          
          if (inboxState && inboxState[0] && inboxState[0].identifiers && inboxState[0].identifiers[0]) {
            const memberAddress = inboxState[0].identifiers[0].identifier;
            console.log(`📍 Address: ${memberAddress}`);
            
            // Check if this matches tanto.base.eth
            const tantoAddress = '0x6529b0f882B209a1918fA6935A40C224611cc510';
            if (memberAddress.toLowerCase() === tantoAddress.toLowerCase()) {
              console.log('🎯 THIS IS TANTO.BASE.ETH!');
              console.log(`   Inbox ID: ${member.inboxId}`);
              console.log(`   Address: ${memberAddress}`);
            }
          } else {
            console.log('❌ No address found for this inbox ID');
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkInboxAddress();
