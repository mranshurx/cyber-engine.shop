const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_SECRET = "AimhackAdmin2026";
const KEYS_FILE = path.join(__dirname, 'keys.json');

function loadKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        }
    } catch (e) {}
    return {
        "AMHK-DEMO-KEY": {
            key: "AMHK-DEMO-KEY",
            createdAt: new Date().toISOString(),
            expiresAt: new Date("2026-11-15T00:00:00.000Z").toISOString(),
            status: "active"
        }
    };
}

function saveKeys(keys) {
    try {
        fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
    } catch (e) {}
}

let activeLicenses = loadKeys();

const checkAdminAuth = (req, res, next) => {
    if (req.headers['x-admin-auth'] !== ADMIN_SECRET) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    next();
};

app.post('/api/admin/login', (req, res) => {
    if (req.body.password === ADMIN_SECRET) return res.json({ success: true });
    res.status(401).json({ success: false, message: "Invalid password" });
});

app.post('/api/admin/create-key', checkAdminAuth, (req, res) => {
    const { key, days = 0, hours = 0, minutes = 0 } = req.body;
    if (!key) return res.status(400).json({ success: false, message: "Key required" });
    
    // Calculate precise duration based on input
    const durationMs = (parseInt(days) * 86400 + parseInt(hours) * 3600 + parseInt(minutes) * 60) * 1000;
    if (durationMs <= 0) return res.status(400).json({ success: false, message: "Invalid duration" });

    // Lock in exact expiration date
    const expiresAt = new Date(Date.now() + durationMs).toISOString();

    activeLicenses[key] = { key, createdAt: new Date().toISOString(), expiresAt, status: "active" };
    saveKeys(activeLicenses);
    res.json({ success: true, data: activeLicenses[key] });
});

app.get('/api/admin/keys', checkAdminAuth, (req, res) => {
    res.json({ success: true, keys: Object.values(activeLicenses) });
});

app.post('/api/admin/delete-key', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (activeLicenses[key]) {
        delete activeLicenses[key];
        saveKeys(activeLicenses);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

app.post('/api/verify', (req, res) => {
    const { key } = req.body;
    const license = activeLicenses[key];
    if (!license || license.status !== "active" || new Date(license.expiresAt) < new Date()) {
        return res.status(401).json({ success: false, message: "Invalid or expired key" });
    }
    res.json({ success: true, expiresAt: license.expiresAt });
});

// DYNAMIC CONFIG API (ENFORCES KEY'S EXACT SAVED EXPIRATION TIMESTAMP)
app.get('/api/get-config', (req, res) => {
    const { key } = req.query;
    const license = activeLicenses[key];

    if (!license || license.status !== "active" || new Date(license.expiresAt) < new Date()) {
        if (license) {
            license.status = "expired";
            saveKeys(activeLicenses);
        }
        return res.status(403).send("Key Expired or Invalid");
    }

    // Exact Unix Timestamp for the key's saved expiration date
    const expireUnix = Math.floor(new Date(license.expiresAt).getTime() / 1000);
    const totalBytesQuota = 74109405568; // 69.0 GB Display

    const jsonConfig = {
      "remarks": `Aimhack-${key.slice(-4)}`,
      "inbounds": [
        { "tag": "socks", "listen": "127.0.0.1", "port": 10808, "protocol": "socks", "settings": { "auth": "noauth", "udp": true } },
        { "tag": "http", "listen": "127.0.0.1", "port": 10809, "protocol": "http", "settings": { "auth": "noauth" } }
      ],
      "outbounds": [
        {
          "tag": "proxy",
          "protocol": "hysteria",
          "settings": { "address": "wraith-bom2.aimhack.shop", "port": 443, "version": 2 },
          "streamSettings": {
            "network": "hysteria", "security": "tls",
            "tlsSettings": { "serverName": "wraith-bom2.aimhack.shop", "alpn": ["h3"] },
            "hysteriaSettings": { "version": 2, "auth": key }
          }
        },
        { "tag": "direct", "protocol": "freedom" }
      ],
      "routing": {
        "domainStrategy": "AsIs",
        "rules": [
          { "type": "field", "network": "tcp,udp", "outboundTag": "direct" }
        ]
      }
    };

    const subscriptionPayload = 
        `#profile-title: AIMHACK\n` +
        `#subscription-userinfo: upload=0; download=0; total=${totalBytesQuota}; expire=${expireUnix}\n` +
        `#profile-update-interval: 1\n\n` +
        JSON.stringify(jsonConfig, null, 2);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(subscriptionPayload);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on 0.0.0.0:${PORT}`));
