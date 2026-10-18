const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());

const ADMIN_SECRET = "AimhackAdmin2026";
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Helper: Load Keys from Disk
function loadKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            const data = fs.readFileSync(KEYS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Error reading keys.json:", e);
    }
    return {
        "AMHK-DEMO-KEY": {
            key: "AMHK-DEMO-KEY",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            status: "active"
        }
    };
}

// Helper: Save Keys to Disk
function saveKeys(keys) {
    try {
        fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
    } catch (e) {
        console.error("Error saving keys.json:", e);
    }
}

let activeLicenses = loadKeys();

const checkAdminAuth = (req, res, next) => {
    const adminPassword = req.headers['x-admin-auth'];
    if (adminPassword !== ADMIN_SECRET) {
        return res.status(401).json({ success: false, message: "Unauthorized Admin Password." });
    }
    next();
};

// --- ADMIN API ENDPOINTS ---

app.post('/api/admin/login', (req, res) => {
    if (req.body.password === ADMIN_SECRET) return res.json({ success: true });
    res.status(401).json({ success: false, message: "Invalid Admin Password." });
});

app.post('/api/admin/create-key', checkAdminAuth, (req, res) => {
    const { key, days = 0, hours = 0, minutes = 0 } = req.body;
    if (!key) return res.status(400).json({ success: false, message: "Key required." });

    const durationMs = (parseInt(days) * 86400 + parseInt(hours) * 3600 + parseInt(minutes) * 60) * 1000;
    if (durationMs <= 0) return res.status(400).json({ success: false, message: "Invalid duration." });

    const expiresAt = new Date(Date.now() + durationMs).toISOString();

    activeLicenses[key] = {
        key: key,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt,
        status: "active"
    };

    saveKeys(activeLicenses);
    res.json({ success: true, message: "Key generated successfully!", data: activeLicenses[key] });
});

app.get('/api/admin/keys', checkAdminAuth, (req, res) => {
    res.json({ success: true, keys: Object.values(activeLicenses) });
});

app.post('/api/admin/delete-key', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (activeLicenses[key]) {
        delete activeLicenses[key];
        saveKeys(activeLicenses);
        return res.json({ success: true, message: `Key ${key} deleted.` });
    }
    res.status(404).json({ success: false, message: "Key not found." });
});

// --- CLIENT API ENDPOINTS ---

app.post('/api/verify', (req, res) => {
    const { key } = req.body;
    const license = activeLicenses[key];

    if (!license || license.status !== "active") {
        return res.status(401).json({ success: false, message: "Invalid or inactive key." });
    }

    if (new Date(license.expiresAt) < new Date()) {
        license.status = "expired";
        saveKeys(activeLicenses);
        return res.status(403).json({ success: false, message: "Key has expired." });
    }

    res.json({ success: true, expiresAt: license.expiresAt });
});

// DYNAMIC CONFIG API (SERVES CLEAN JSON + HAPP TIMER HEADERS)
app.get('/api/get-config', (req, res) => {
    const { key } = req.query;
    const license = activeLicenses[key];
    const now = new Date();

    if (!license || license.status !== "active" || new Date(license.expiresAt) < now) {
        if (license) {
            license.status = "expired";
            saveKeys(activeLicenses);
        }
        return res.status(403).json({ error: "Key Expired or Invalid" });
    }

    const expireUnix = Math.floor(new Date(license.expiresAt).getTime() / 1000);

    // Set Happ Headers
    res.setHeader('profile-title', `Aimhack-${key.slice(-4)}`);
    res.setHeader('subscription-userinfo', `upload=0; download=0; total=0; expire=${expireUnix}`);
    res.setHeader('profile-update-interval', '1');
    res.setHeader('Content-Type', 'application/json');

    const jsonConfig = {
      "remarks": `Aimhack-${key.slice(-4)}`,
      "inbounds": [
        {
          "tag": "socks",
          "listen": "127.0.0.1",
          "port": 10808,
          "protocol": "socks",
          "settings": { "auth": "noauth", "udp": true },
          "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "routeOnly": false }
        },
        {
          "tag": "http",
          "listen": "127.0.0.1",
          "port": 10809,
          "protocol": "http",
          "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "routeOnly": false },
          "settings": { "auth": "noauth" }
        }
      ],
      "outbounds": [
        {
          "tag": "proxy",
          "protocol": "hysteria",
          "settings": { "address": "wraith-bom2.aimhack.shop", "port": 443, "version": 2 },
          "streamSettings": {
            "network": "hysteria",
            "security": "tls",
            "tlsSettings": { "serverName": "wraith-bom2.aimhack.shop", "alpn": ["h3"] },
            "hysteriaSettings": { "version": 2, "auth": key }
          }
        },
        { "tag": "direct", "protocol": "freedom" }
      ],
      "routing": {
        "domainStrategy": "AsIs",
        "rules": [
          {
            "type": "field",
            "domain": [
              "full:clientbp.ggpolarbear.com", "full:loginbp.ggpolarbear.com", "full:core-bs.ggpolarbear.com",
              "full:core-bs.freefiremobile.com", "full:core-tata.freefireind.in", "full:core-gmc.freefiremobile.com",
              "full:client.ind.freefiremobile.com", "full:client.us.freefiremobile.com", "full:sgnetwork.ggblueshark.com",
              "full:menetwork.ggblueshark.com", "full:bdnetwork.ggpolarbear.com", "full:100067.connect.garena.com",
              "full:100067.msdk.garena.com", "full:clientbp.ppmainecoonghj.com", "full:loginbp.ppmainecoonghj.com",
              "full:ffmconnect.ppmainecoonghj.com", "full:ffmmsdk.ppmainecoonghj.com",
              "regexp:^(clientbp|loginbp|core-[a-z0-9]+|[a-z]+network|ffmconnect|ffmmsdk)\\."
            ],
            "outboundTag": "proxy"
          },
          {
            "type":
