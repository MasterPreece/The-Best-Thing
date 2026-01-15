# Testing Guide for New Features 🧪

## ✅ Features to Test

### 1. Item Detail Page ✨
**How to test:**
1. Go to Rankings page (`/rankings`)
2. Click on any item in the rankings list
3. You should see:
   - ✅ Item image and title
   - ✅ Stats: Ranking, Elo Rating, Win Rate, Total Comparisons, Wins, Losses
   - ✅ "Top Opponents" section showing most common matchups
   - ✅ "Recent Comparisons" section showing recent matches
   - ✅ Share buttons (Copy Link, Twitter, Facebook)
   - ✅ Wikipedia link button

**What to check:**
- [ ] All stats display correctly
- [ ] Images load properly (or show placeholder)
- [ ] Share buttons work (opens Twitter/Facebook or copies link)
- [ ] Wikipedia link opens in new tab
- [ ] "Back to Rankings" button works
- [ ] Page is mobile-responsive

### 2. Comments/Discussions System 💬
**How to test:**
1. Go to an Item Detail page (click any item from rankings)
2. Scroll down to "Discussions" section
3. **Without login:** Should show "Login to comment..." placeholder
4. **With login:**
   - Login or create account
   - Type a comment (max 1000 characters)
   - Click "Post Comment"
   - Comment should appear in the list
   - You should see your username and delete button (🗑️) on your own comments

**What to check:**
- [ ] Comments display in reverse chronological order (newest first)
- [ ] Character counter shows (X/1000)
- [ ] Can post comments when logged in
- [ ] Can delete your own comments
- [ ] Can't delete other users' comments
- [ ] Comment form is disabled when not logged in
- [ ] Comments persist after page refresh

### 3. Enhanced Sharing 📤
**How to test:**
1. Go to any Item Detail page
2. Click share buttons in the header:
   - **Copy Link:** Should copy current URL to clipboard
   - **Twitter:** Should open Twitter share dialog
   - **Facebook:** Should open Facebook share dialog

**What to check:**
- [ ] Copy link works (check clipboard)
- [ ] Twitter opens with pre-filled text
- [ ] Facebook opens with URL
- [ ] All share buttons are visible and styled correctly

### 4. Clickable Rankings 🔗
**How to test:**
1. Go to Rankings page (`/rankings`)
2. Hover over any ranking item
3. Click on any item
4. Should navigate to Item Detail page

**What to check:**
- [ ] Items are clickable (cursor changes on hover)
- [ ] Clicking navigates to `/items/:id`
- [ ] Hover effect shows item is clickable
- [ ] Works on both regular rankings and search results

## 🔍 Edge Cases to Test

### Empty States
- [ ] Item with no image shows placeholder
- [ ] Item with no recent comparisons doesn't break
- [ ] Item with no top opponents doesn't break
- [ ] Item with no comments shows "No comments yet" message

### Database States
- [ ] New items (0 comparisons) display correctly
- [ ] Items with high win rates display correctly
- [ ] Items with 0% win rate display correctly

### Mobile Testing
- [ ] Item Detail page is responsive on mobile
- [ ] Share buttons work on mobile
- [ ] Comments section is usable on mobile
- [ ] Rankings are clickable on mobile

### Authentication States
- [ ] Anonymous users can view item details
- [ ] Anonymous users can see comments
- [ ] Anonymous users cannot post comments
- [ ] Logged-in users can post comments
- [ ] Logged-in users can only delete their own comments

## 🐛 Common Issues to Watch For

1. **API Errors:** Check browser console for 404/500 errors
2. **Missing Images:** Items without images should show placeholder
3. **Slow Loading:** Comments and stats might take a moment to load
4. **Database:** Make sure database has items with comparisons for testing

## 📝 Test Checklist Summary

- [ ] Item Detail page loads correctly
- [ ] All stats display accurately
- [ ] Share buttons work
- [ ] Rankings are clickable
- [ ] Comments can be posted (when logged in)
- [ ] Comments can be deleted (own comments only)
- [ ] Page is mobile-responsive
- [ ] Back button works
- [ ] Wikipedia link works

## 🚀 Quick Test Flow

1. **Start the server:** `npm run dev`
2. **Open browser:** http://localhost:3000
3. **Navigate to Rankings:** Click "Rankings" in navbar
4. **Click an item:** Click any item to see detail page
5. **Test sharing:** Try all share buttons
6. **Login:** Create account or login
7. **Post comment:** Add a test comment
8. **Test delete:** Try deleting your comment
9. **Test mobile:** Resize browser or use dev tools mobile view

## 🎯 Expected Results

✅ All features should work smoothly
✅ No console errors (except maybe some warnings)
✅ Pages load quickly
✅ Mobile experience is good
✅ Sharing functions work as expected
✅ Comments persist and display correctly

---

**Note:** If you encounter any issues, check:
- Browser console for errors
- Network tab for failed API requests
- Database has items and comparisons
- User is logged in for comment features

