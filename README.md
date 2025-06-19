# 🚀 TeleCloud

A modern fullstack monorepo built with NX, TypeScript, and GitHub Actions.
This project enables you to use Telegram channels as a cloud storage solution — free, scalable, and easy to use.

---

## ⚙️ Setup

### 🧰 Bots and Channels Configuration

1. Create a `.env` file in the root directory.
2. Create one or more Telegram bots using [@BotFather](https://t.me/BotFather). Add their tokens to your `.env` file:

   ```env
   TELEGRAM_BOT_TOKENS=123456:abcdefg,123456:hijklmn
   ```

3. Create Telegram channels for storage. Add the bots from step 2 as **admins** in those channels. Then add the channel IDs to your `.env`:

   ```env
   STORAGE_CHANNEL_IDS=-123444,-123555
   ```

   Tip: Forward a message from a channel to a bot to get the channel's chat ID.

4. Add your user chat IDs (the bots will communicate with these users), run the program, try sending massage to the bot and then you can see the chatId:

   ```env
   CHAT_IDS=1234,12345
   ```

5. Specify where to restore downloaded files:

   ```env
   RESTORE_OUTPUT_PATH=C:\Users\YourName\Desktop
   ```

6. Set your admin chat ID (used for logging or privileged actions):

   ```env
   ADMIN_CHAT_ID=1234
   ```

7. Set the local folder path for uploading files:

   ```env
   DEFAULT_DRIVE_PATH=C:\Path\To\Folder
   ```

### ⚡ Installation & Running

```bash
# Clone the repo
git clone https://github.com/golan132/telecloud.git
cd telecloud

# Install dependencies
npm install

# Run all apps
npx nx run-many --target=serve --all
```

---

## 🌟 Features

- ✉️ Automatically extract chat IDs from forwarded messages
- ♻️ Parallel media uploads to multiple storage channels
- ⇪ Auto-upload files from PC to storage channels
- 🔄 Restore media from channels back to your local machine

---

## 📘 How to Use

Once the program is running, simply start chatting with one of your bots on Telegram.

- You’ll see a list of available options in the chat.
- Use the **Help** button to get detailed instructions inside Telegram.

---

## 🔠 Uses

- **Backend**: NestJS
- **Language**: TypeScript
- **CI/CD**: GitHub Actions
- **Architecture**: NX Monorepo

---

## 🗓 To-do

- [x] Initial project setup
- [x] Telegram integration module
- [x] Telegram conversation module
- [x] File handling module
- [ ] Improve generic path handling in `getFileInfo`
- [ ] Add file encryption & decryption
