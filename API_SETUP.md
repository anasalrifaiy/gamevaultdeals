# 🔑 API Setup Guide

This guide will help you set up API keys for IsThereAnyDeal and RAWG to get more deals and real popularity data.

## 📊 Why Use These APIs?

**Current (CheapShark only):**
- ~600 deals maximum
- ~35 stores
- Manual popularity rankings

**With ITAD + RAWG:**
- ~2000+ deals
- ~50+ legitimate stores
- Real popularity scores from actual player data
- Better game metadata

---

## 🚀 Step 1: Get IsThereAnyDeal API Key (5 minutes)

**IsThereAnyDeal** provides game deals from 50+ legitimate stores.

### How to Get Your Key:

1. **Visit:** https://isthereanydeal.com/dev/app/

2. **Register/Login:**
   - Click "Register" if you don't have an account
   - Or login with existing account

3. **Create App:**
   - Go to "Developer" → "Create App"
   - App Name: `GameVault Deals`
   - Description: `PC game deals aggregator`
   - Website: `https://gamevaultdeals.com`

4. **Get API Key:**
   - Copy your API key (looks like: `abc123xyz456...`)
   - Keep it safe!

5. **Add to Config:**
   - Open `script.js`
   - Find line 6: `ITAD_API_KEY: 'YOUR_ITAD_API_KEY_HERE'`
   - Replace with: `ITAD_API_KEY: 'your-actual-key-here'`
   - Change line 18 to: `USE_ITAD: true`

---

## 🎮 Step 2: Get RAWG API Key (3 minutes)

**RAWG** provides real game popularity scores, ratings, and metadata.

### How to Get Your Key:

1. **Visit:** https://rawg.io/apidocs

2. **Get API Key:**
   - Click "Get API Key" button
   - Sign up with email (free, no credit card needed)
   - Verify your email

3. **Copy Key:**
   - After verification, your API key will be shown
   - Copy it (looks like: `def789uvw012...`)

4. **Add to Config:**
   - Open `script.js`
   - Find line 7: `RAWG_API_KEY: 'YOUR_RAWG_API_KEY_HERE'`
   - Replace with: `RAWG_API_KEY: 'your-actual-key-here'`
   - Change line 19 to: `USE_RAWG: true`

---

## ✅ Step 3: Verify Setup

After adding both API keys:

1. **Save `script.js`**

2. **Commit Changes:**
   ```bash
   git add script.js
   git commit -m "Add ITAD and RAWG API keys"
   git push
   ```

3. **Test Your Site:**
   - Visit https://gamevaultdeals.com
   - You should see MORE deals
   - Popular games should show real popularity scores

---

## 🔒 Security Notes

- ✅ These are **frontend API keys** - safe to use in browser
- ✅ Both services allow browser-based requests
- ✅ No rate limits for reasonable usage
- ✅ Keys are free forever

---

## 📈 What You'll Get

### With ITAD:
- 2-3x more deals
- More stores (Steam, Epic, GOG, Humble, Fanatical, etc.)
- Better price history
- More accurate deal information

### With RAWG:
- Real popularity scores (not manual rankings)
- Metacritic ratings
- Better game descriptions
- Genre information
- Release dates

---

## 🆘 Need Help?

If you have issues:
1. Double-check API keys are correct (no extra spaces)
2. Make sure `USE_ITAD` and `USE_RAWG` are set to `true`
3. Check browser console for errors (F12 → Console tab)
4. Verify your API keys are active on the provider websites

---

## 🎉 That's It!

Once configured, your site will automatically use both APIs to provide the best game deals experience!
