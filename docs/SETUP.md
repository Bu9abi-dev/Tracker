# Setup guide (no coding needed)

This connects the app to **your Google Sheet**, so it shows your real numbers, and switches on **statement reading** with Google's free AI. Do Part 1 first. It's easiest on a computer.

---

## Part 1: connect your Google Sheet (about 10 minutes)

**A. Put the script into your Sheet**

1. Open your tracker in **Google Sheets**.
2. In the top menu, click **Extensions → Apps Script**. A new tab opens.
3. In that tab, click **Code.gs** on the left, select everything in the editor and delete it.
4. Open [apps-script/Code.gs on GitHub](https://github.com/Bu9abi-dev/Tracker/blob/main/apps-script/Code.gs), click the **Copy raw file** button (two overlapping squares), and paste it into the empty editor.
5. Click the **💾 Save** icon.

**B. Create your secret token**

6. At the top of the editor, in the dropdown next to **▷ Run**, choose **generateToken**, then click **▷ Run**.
7. Google asks for permission:
   - Click **Review permissions** and pick your Google account.
   - You'll see **"Google hasn't verified this app."** That's normal: it's your own script. Click **Advanced**, then **Go to … (unsafe)**, then **Allow**.
8. Go back to your Sheet's tab. A box shows your **token**, a long code. **Copy it** and keep it somewhere safe for step 13.
   - A new **Portfolios** tab also appears in your Sheet. That's the app's list of portfolios.

**C. Turn the script into a web link**

9. Back in Apps Script, click **Deploy → New deployment**.
10. Click the ⚙️ gear next to "Select type" and choose **Web app**. Set:
    - **Execute as:** Me
    - **Who has access:** Anyone. The token is what keeps it private.
11. Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

**D. Tell the app where your Sheet is**

12. Go to **vercel.com**, open your **Tracker** project, then **Settings → Environment Variables**.
13. Add these three, clicking **Save** after each:

    | Name | Value |
    | --- | --- |
    | `DATA_SOURCE` | `apps-script` |
    | `APPS_SCRIPT_URL` | the Web app URL from step 11 |
    | `APPS_SCRIPT_TOKEN` | the token from step 8 |

14. Go to the **Deployments** tab, tap **⋯** on the top one, then **Redeploy**.
15. Open the app on your phone. The yellow "sample numbers" message is gone, and you'll see your real numbers. 🎉

---

## Part 2: switch on statement reading (about 3 minutes)

1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** and sign in with Google.
2. Click **Create API key** and copy it.
3. In Vercel, under **Settings → Environment Variables**, add `GEMINI_API_KEY` with that key and click **Save**.
4. Under **Deployments**, tap **⋯ → Redeploy**.
5. In the app, go to **Upload**, pick a portfolio and choose a statement. Gemini reads it and you check the numbers before saving.

> **Privacy:** on Gemini's free plan, Google may use what you upload to improve its AI. The app doesn't keep the file itself. Only the holdings you confirm are saved, in a **Holdings** tab in your Sheet.

---

## Everyday use

- **Add an entry:** use the **Add** tab, or type in your Sheet as you always have. The app shows the change within about a minute.
- **Upload a statement:** use the **Upload** tab. If anything doesn't add up, the app highlights it, and you tick each item after checking it against your statement before you can save.
- **Add a portfolio:** go to **Portfolios** and tap **+ New**. It gets its own tab in your Sheet, laid out like your others.
  - "Someone else's" portfolios, like your mother's, are always kept out of your Personal totals. This can't be changed later.
- **Rename or archive a portfolio:** edit its row in the **Portfolios** tab of your Sheet. Set Status to `archived` to hide it.

## If something goes wrong

| You see | What to do |
| --- | --- |
| "sample numbers" message | Part 1 isn't finished, or you didn't **Redeploy** in Vercel after adding the settings. |
| "rejected the app's token" | `APPS_SCRIPT_TOKEN` in Vercel doesn't match. Run **generateToken** again, then update the value in Vercel and redeploy. |
| "Apps Script is out of date" | In Apps Script, go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Don't make a *new* deployment, because that changes the link. |
| "returned a web page instead of data" | Check **Who has access** is **Anyone**, and that the URL ends in `/exec`. |
| "Gemini's free limit is used up" | Wait a while and try again. The free plan has daily limits. |
| "model … wasn't found" | Google retired the AI model. In Vercel, add `GEMINI_MODEL` set to a current "flash" model name from Google AI Studio, then redeploy. |
| File is over 4 MB | Export fewer pages, or upload screenshots of the holdings page instead. |
