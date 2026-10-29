# Updating the extension

There are two ways to run System Audit. Neither needs you to remove and reinstall anything.

## On your own Chrome (unpacked)

Every push to `main` builds the extension and publishes it to the **`extension`** branch of this repository. GitHub Actions does this automatically.

**One-time setup**
1. Install [GitHub Desktop](https://desktop.github.com/).
2. Choose *File → Clone repository*, pick this repository, and clone it to a folder such as `Documents/DSAudit-extension`.
3. In GitHub Desktop, switch to the **`extension`** branch. The folder now contains `manifest.json`, `panel.js` and the other built files.
4. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose that folder.

**Every update after that**
1. In GitHub Desktop, click **Fetch origin**, then **Pull**.
2. In `chrome://extensions`, click the **reload** arrow on System Audit.

Your saved audits, report details and settings are kept, because the extension's ID stays the same as long as the folder does.

If you'd rather not use GitHub Desktop, the newest build is also attached to the **Latest build** release as `system-audit-extension.zip`. Unzip it over the same folder and click reload.

## On the Chrome Web Store

A new version is uploaded to your **existing** listing and replaces the old one. Users get it as an automatic update. Chrome reviews each version, which usually takes from a few hours to a few days.

**One-time setup**
1. **First upload by hand.** Run `npm run package` and upload `system-audit-extension.zip` in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole). Fill in the listing and privacy details there. Then note two things:
   - the **extension ID** (the 32-letter ID on the item page);
   - your **publisher ID** (shown in the dashboard's account settings).
2. **API access.** In [Google Cloud Console](https://console.cloud.google.com/):
   - Create a project and enable the **Chrome Web Store API**.
   - Configure the OAuth consent screen. "External" is fine, and you can add yourself as a test user.
   - Create an **OAuth client ID** of type *Desktop app*. Note the client ID and client secret.
   - Get a **refresh token** for that client with the `https://www.googleapis.com/auth/chromewebstore` scope. The `chrome-webstore-upload-keys` helper (`npx chrome-webstore-upload-keys`) walks you through this.
3. **Secrets.** In this repository, open *Settings → Secrets and variables → Actions* and add:

   | Secret | Value |
   | --- | --- |
   | `CWS_EXTENSION_ID` | the extension ID from step 1 |
   | `CWS_PUBLISHER_ID` | your publisher ID |
   | `CWS_CLIENT_ID` | the OAuth client ID |
   | `CWS_CLIENT_SECRET` | the OAuth client secret |
   | `CWS_REFRESH_TOKEN` | the refresh token |

**Every release after that**

```bash
npm version patch          # 0.3.0 → 0.3.1: updates package.json and creates the tag v0.3.1
git push --follow-tags     # the "Publish to Chrome Web Store" workflow uploads it and submits it for review
```

Use `npm version minor` for bigger releases. The store rejects a version number it has already seen, which is why every release bumps it. The workflow also checks that the tag matches `package.json`.

You can watch progress in the repository's **Actions** tab. Until the secrets are added, the workflow still builds the zip (downloadable from the run's page) and skips the upload with a notice.
