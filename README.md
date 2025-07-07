# dms-node
To deploy your Node.js project on an **Ubuntu server**, you’ll need to install the necessary system dependencies and Node.js-related tools to run your app successfully. Here's a complete step-by-step setup guide with all the commands:

---

### ✅ 1. **Update and Upgrade Packages**

```bash
sudo apt update && sudo apt upgrade -y
```

---

### ✅ 2. **Install Node.js & npm**

Check your Node.js version locally (e.g., `node -v`), then install a compatible version on the server:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

✅ Verify installation:

```bash
node -v
npm -v
```

---

### ✅ 3. **Install Git (if not already installed)**

```bash
sudo apt install git -y
```

---

### ✅ 4. **Install Build Tools for native dependencies (`canvas`, `tesseract.js`)**

```bash
sudo apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

For `canvas`, the above packages are **required**. Without them, `npm install` will fail.

---

### ✅ 5. **Install Tesseract-OCR System Package (for `tesseract.js`)**

```bash
sudo apt install -y tesseract-ocr
sudo apt install -y imagemagick graphicsmagick

```

Optionally install language packs:

```bash
sudo apt install -y tesseract-ocr-eng tesseract-ocr-hin  # Add more as needed
```

---

### ✅ 6. **Clone Your Project or Upload It**

```bash
git clone https://your-repo-url.git
cd document-management-system
```

Or use `scp` or `rsync` to upload your project from local to server.

---

### ✅ 7. **Create `.env` File**

If your project uses `dotenv`, copy or create a `.env` file:

```bash
cp .env.example .env   # if you have one
nano .env              # edit with actual values
```

---

### ✅ 8. **Install Project Dependencies**

```bash
npm install
```

---

### ✅ 9. **Run Seeder Scripts (Optional)**

If needed:

```bash
npm run seed-all
```

---

### ✅ 10. **Start the App**

* For development (auto-restarts):

```bash
npm run dev
```

* For production:

```bash
npm start
```

---

### ✅ 11. **(Optional) Use PM2 to Keep the App Alive**

```bash
sudo npm install -g pm2
pm2 start index.js --name document-app
pm2 save
pm2 startup
```

This will keep your app running in the background even after server restarts.

---

