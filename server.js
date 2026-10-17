const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin Security Password
const ADMIN_SECRET = "AimhackAdmin2026";

// In-Memory Database (Keys storage)
let activeLicenses = {
    "AMHK-DEMO-KEY": {
        key: "AMHK-DEMO-KEY",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 Hours
        status: "active"
    }
};

// Middleware to secure Admin endpoints
const checkAdminAuth = (req, res, next) => {
    const adminPassword = req.headers['x-admin-auth'];
    if (adminPassword !== ADMIN_SECRET) {
        return res.status(401).json({ success: false, message: "Unauthorized Admin Password." });
    }
    next();
};

// --- ADMIN API ENDPOINTS ---

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_SECRET) {
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, message: "Invalid Admin Password." });
});

app.post('/api/admin/create-key', checkAdminAuth, (req, res) => {
    const { key, days = 0, hours = 0, minutes = 0 } = req.body;

    if (!key) {
        return res.status(400).json({ success: false, message: "License key string required." });
    }

    const durationMs = (parseInt(days) * 86400 + parseInt(hours) * 3600 + parseInt(minutes) * 60) * 1000;
    
    if (durationMs <= 0) {
        return res.status(400).json({ success: false, message: "Duration must be greater than 0." });
    }

    const expiresAt = new Date(Date.now() + durationMs).toISOString();

    activeLicenses[key] = {
        key: key,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt,
        status: "active"
    };

    res.json({ success: true, message: "License generated!", data: activeLicenses[key] });
});

app.get('/api/admin/keys', checkAdminAuth, (req, res) => {
    res.json({ success: true, keys: Object.values(activeLicenses) });
});

app.post('/api/admin/delete-key', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (activeLicenses[key]) {
        delete activeLicenses[key];
        return res.json({ success: true, message: `Key ${key} revoked successfully.` });
    }
    res.status(404).json({ success: false, message: "Key not found." });
});


// --- CLIENT API ENDPOINTS ---

app.post('/api/verify', (req, res) => {
    const { key } = req.body;
    const license = activeLicenses[key];

    if (!license || license.status !== "active") {
        return res.status(401).json({ success: false, message: "Invalid or inactive license key." });
    }

    const now = new Date();
    const expiresAt = new Date(license.expiresAt);

    if (expiresAt < now) {
        license.status = "expired";
        return res.status(403).json({ success: false, message: "License key has expired." });
    }

    res.json({ 
        success: true, 
        message: "License verified successfully!",
        expiresAt: license.expiresAt
    });
});

// DYNAMIC SUBSCRIPTION API FOR HAPP
app.get('/api/get-config', (req, res) => {
    const { key } = req.query;
    const license = activeLicenses[key];
    const now = new Date();

    if (!license || license.status !== "active" || new Date(license.expiresAt) < now) {
        if (license) license.status = "expired";
        res.setHeader('profile-title', 'KEY EXPIRED ❌');
        return res.status(403).send("KEY EXPIRED - Renewal required.");
    }

    const expireUnix = Math.floor(new Date(license.expiresAt).getTime() / 1000);

    res.setHeader('profile-title', `Aimhack [${key.slice(-4)}]`);
    res.setHeader('Subscription-Userinfo', `expire=${expireUnix}`);
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
            "type": "field",
            "ip": [
              "0.0.0.0/24", "101.32.114.0/23", "101.33.44.0/22", "102.204.191.0/24", "102.217.238.0/24",
              "103.103.244.0/24", "103.108.100.0/22", "103.117.4.0/22", "103.123.54.0/23", "103.127.228.0/22",
              "103.16.32.0/22", "103.215.127.0/24", "103.219.200.0/22", "103.237.102.0/23", "103.247.204.0/22"
            ],
            "outboundTag": "proxy"
          },
          { "type": "field", "network": "tcp", "port": "39000-39999", "outboundTag": "proxy" },
          { "type": "field", "network": "udp", "port": "10000-10999", "outboundTag": "proxy" },
          { "type": "field", "network": "tcp,udp", "outboundTag": "direct" }
        ]
      },
      "log": {
        "access": "/data/user/0/com.happproxy/files/logs/access/access_log.txt",
        "error": "/data/user/0/com.happproxy/files/logs/error/1792242339042_error_log.txt"
      }
    };

    res.json(jsonConfig);
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
