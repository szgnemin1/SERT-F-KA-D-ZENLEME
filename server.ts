import express from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { exec } from "child_process";

const JWT_SECRET = "procertify-super-secret-key-2024-static";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 5555;
  const DATA_FILE = path.join(process.cwd(), 'data.json');

  // Parse JSON bodies (with increased limit for base64 images)
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));

  const verifyToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: "Erişim reddedildi. Token bulunamadı." });
    }

    try {
      const verified = jwt.verify(token, JWT_SECRET);
      (req as any).user = verified;
      next();
    } catch (err) {
      res.status(401).json({ error: "Geçersiz veya süresi dolmuş token." });
    }
  };

  // API Route to GET data
  app.get('/api/data', verifyToken, (req, res) => {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        // Remove password from exported data for safety
        if (parsed.appPassword) delete parsed.appPassword;
        res.json(parsed);
      } else {
        res.json({});
      }
    } catch (error) {
      console.error("Data read error:", error);
      res.status(500).json({ error: "Veri okunamadı." });
    }
  });

  // API Route to POST data
  app.post('/api/data', verifyToken, (req, res) => {
    try {
      let dataToSave = req.body;
      
      // Preserve existing password
      if (fs.existsSync(DATA_FILE)) {
        try {
           const existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
           if (existingData.appPassword) {
              dataToSave.appPassword = existingData.appPassword;
           }
        } catch(e) {
           console.error("Existing data corrupted, overwriting without old password");
        }
      }

      fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
      res.json({ success: true });
    } catch (error) {
      console.error("Data write error:", error);
      res.status(500).json({ error: "Veri kaydedilemedi." });
    }
  });

  // API Route to Login
  app.post('/api/login', (req, res) => {
    try {
      const { password } = req.body;
      let currentPassword = 'admin5555'; // Default password
      if (fs.existsSync(DATA_FILE)) {
         const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
         if (data.appPassword) currentPassword = data.appPassword;
      }
      
      if (password === currentPassword) {
         const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
         res.json({ success: true, token });
      } else {
         res.status(401).json({ error: "Hatalı şifre" });
      }
    } catch (error) {
      res.status(500).json({ error: "Giriş işlemi başarısız" });
    }
  });

  // API Route to Change Password
  app.post('/api/change-password', verifyToken, (req, res) => {
    try {
      const { newPassword } = req.body;
      let data: any = {};
      if (fs.existsSync(DATA_FILE)) {
         data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      }
      data.appPassword = newPassword;
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
      res.json({ success: true });
    } catch(error) {
      res.status(500).json({ error: "Şifre değiştirilemedi" });
    }
  });

  const isProduction = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production " || fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'));

  // Serve dogrula.html bypass for dev mode and explicit definition
  app.get('/dogrula.html', (req, res) => {
    const isProd = process.env.NODE_ENV === "production";
    const dogrulaPath = isProd 
      ? path.join(process.cwd(), 'dist', 'dogrula.html')
      : path.join(process.cwd(), 'public', 'dogrula.html');
      
    if (fs.existsSync(dogrulaPath)) {
       res.sendFile(dogrulaPath);
    } else {
       res.status(404).send("Dogrulama sayfasi bulunamadi.");
    }
  });

  app.get('/api/verify/:id', (req, res) => {
    const certPath = path.join(process.cwd(), 'certificates.json');
    if (!fs.existsSync(certPath)) {
       return res.status(404).json({ error: "No certificates found" });
    }
    const data = JSON.parse(fs.readFileSync(certPath, 'utf8'));
    const cert = data[req.params.id];
    if (cert) {
        res.json(cert);
    } else {
        res.status(404).json({ error: "Certificate not found" });
    }
  });

  app.post('/api/issue', verifyToken, (req, res) => {
    try {
      const records = req.body;
      const certPath = path.join(process.cwd(), 'certificates.json');
      let data: any = {};
      
      if (fs.existsSync(certPath)) {
         data = JSON.parse(fs.readFileSync(certPath, 'utf8'));
      }
      
      if (Array.isArray(records)) {
          records.forEach(r => {
             data[r.serialNo] = r;
          });
      } else {
          data[records.serialNo] = records;
      }
      
      fs.writeFileSync(certPath, JSON.stringify(data, null, 2), 'utf8');
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to issue certificates" });
    }
  });

  // API Route to Self-Update via GitHub in PM2/VPS environment
  app.post('/api/update-app', verifyToken, (req, res) => {
    console.log("GitHub güncelleme tetiklendi...");
    const cmd = "git pull && npm run build";
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Güncelleme hatası oluştu:", error);
        return res.status(500).json({
          success: false,
          error: error.message,
          stdout: stdout || "",
          stderr: stderr || ""
        });
      }
      
      res.json({
        success: true,
        stdout: stdout || "",
        stderr: stderr || "",
        message: "Uygulama başarıyla güncellendi ve derlendi! Sunucu PM2 tarafından yeniden başlatılıyor..."
      });
      
      // Since PM2 manages this, process.exit(0) will trigger an automatic clean reload
      setTimeout(() => {
        console.log("PM2 tetiklemesi için çıkış yapılıyor...");
        process.exit(0);
      }, 1500);
    });
  });

  // Serve static files in production or map vite middleware in dev
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to 0.0.0.0
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Sunucu http://0.0.0.0:${PORT} adresinde çalışıyor`);
  });
}

startServer();
