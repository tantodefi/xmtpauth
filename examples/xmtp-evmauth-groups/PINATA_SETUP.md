# 🌐 Pinata IPFS Setup Guide

This guide shows you how to set up Pinata for NFT metadata and image storage.

## 📋 Required Pinata Environment Variables

Add these to your `.env` file on Render:

```bash
# Pinata API Configuration (REQUIRED for production NFTs)
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your_jwt_here
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/

# Optional: Alternative API keys (if not using JWT)
PINATA_API_KEY=your_api_key_here
PINATA_SECRET_API_KEY=your_secret_key_here

# Default NFT Image (already set)
DEFAULT_NFT_IMAGE_HASH=bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne
```

## 🔑 How to Get Pinata API Keys

### Step 1: Create Pinata Account
1. Go to [https://pinata.cloud](https://pinata.cloud)
2. Sign up for a free account
3. Verify your email

### Step 2: Get JWT Token (Recommended)
1. Go to **API Keys** in your Pinata dashboard
2. Click **New Key**
3. Select permissions:
   - ✅ **pinFileToIPFS** (for images)
   - ✅ **pinJSONToIPFS** (for metadata)
   - ✅ **unpin** (optional, for cleanup)
4. Name it: `XMTP-Agent-Production`
5. Click **Create Key**
6. **Copy the JWT token** - you won't see it again!

### Step 3: Alternative - API Key + Secret (Legacy)
If you prefer the old method:
1. Go to **API Keys** → **New Key**
2. Copy both:
   - **API Key** 
   - **API Secret**

## 🚀 Environment Variable Setup

### On Render.com:
1. Go to your service dashboard
2. Click **Environment**
3. Add these variables:

```
PINATA_JWT = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
IPFS_GATEWAY = https://gateway.pinata.cloud/ipfs/
DEFAULT_NFT_IMAGE_HASH = bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne
```

4. Click **Save Changes**
5. Your service will automatically redeploy

## 📁 How It Works

### With Pinata API Keys:
- ✅ **Custom Images**: Users can upload images during tier setup
- ✅ **Real IPFS Storage**: Images and metadata stored on IPFS
- ✅ **Permanent URLs**: `https://gateway.pinata.cloud/ipfs/QmHash...`
- ✅ **Production Ready**: Decentralized, permanent storage

### Without API Keys (Fallback):
- ⚠️ **Default Image Only**: Uses `bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne`
- ⚠️ **Mock Metadata**: Creates deterministic hashes (not real IPFS)
- ⚠️ **Development Only**: Not suitable for production

## 🔍 Testing Your Setup

### Test 1: Check Environment Variables
```bash
# In your agent logs, you should see:
✅ Pinata API key configured
📁 Uploaded image.png to IPFS via Pinata: QmNewHash123...
📄 Uploaded metadata to IPFS via Pinata: QmMetaHash456...
```

### Test 2: Create Tier with Custom Image
```bash
# In XMTP chat:
/setup-tiers dstealth
# Upload an image when prompted
# Should see: "✅ Image uploaded: image.png (45 KB)"
```

### Test 3: Verify NFT Metadata
After minting, check the NFT metadata URL:
```
https://gateway.pinata.cloud/ipfs/QmYourMetadataHash
```

Should show proper JSON with your custom image.

## 💰 Pinata Pricing

### Free Tier:
- ✅ **1 GB storage**
- ✅ **100,000 requests/month**
- ✅ **Perfect for testing & small communities**

### Paid Plans:
- 🚀 **More storage & bandwidth**
- 🚀 **Dedicated gateways**
- 🚀 **Advanced analytics**

For most XMTP communities, the **free tier is sufficient**.

## 🛠️ Troubleshooting

### Error: "No Pinata API key configured"
```bash
# Check your environment variables:
echo $PINATA_JWT
echo $IPFS_GATEWAY

# Should show your actual values, not empty
```

### Error: "Pinata API error: 401"
```bash
# Your JWT token is invalid or expired
# Generate a new one in Pinata dashboard
```

### Error: "Failed to upload to IPFS"
```bash
# Check network connectivity
# Verify Pinata service status: https://status.pinata.cloud
```

### Fallback Behavior:
If Pinata fails, the agent automatically:
1. ⚠️ Logs a warning
2. 🔄 Uses the default image hash
3. ✅ Continues tier setup (doesn't fail)

## 🎯 Production Checklist

- [ ] Pinata account created
- [ ] JWT token generated and copied
- [ ] Environment variables set on Render
- [ ] Service redeployed
- [ ] Test image upload works
- [ ] Test metadata creation works
- [ ] NFTs show custom images

## 📞 Support

If you need help:
1. **Pinata Support**: [https://pinata.cloud/support](https://pinata.cloud/support)
2. **Check logs** for specific error messages
3. **Test with free tier first** before upgrading

---

**Ready to go!** 🚀 Your NFTs will now have proper IPFS storage and custom images!


