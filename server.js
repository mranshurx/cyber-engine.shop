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
            "type": "field",
            "ip": [
              "0.0.0.0/24", "101.32.114.0/23", "101.33.44.0/22", "102.204.191.0/24", "102.217.238.0/24",
              "103.103.244.0/24", "103.108.100.0/22", "103.117.4.0/22", "103.123.54.0/23", "103.127.228.0/22",
              "103.16.32.0/22", "103.215.127.0/24", "103.219.200.0/22", "103.237.102.0/23", "103.247.204.0/22",
              "103.248.57.0/24", "103.248.58.0/23", "103.52.145.0/24", "103.60.16.0/22", "103.62.54.0/24",
              "103.69.179.0/24", "104.166.132.0/23", "104.166.144.0/22", "104.166.148.0/22", "104.166.175.0/24",
              "104.166.185.0/24", "104.166.191.0/24", "107.151.141.0/24", "107.151.192.0/24", "107.151.193.0/24",
              "107.151.240.0/24", "107.151.241.0/24", "107.151.242.0/24", "124.108.136.0/22", "124.108.140.0/23",
              "124.108.149.0/24", "124.108.150.0/23", "124.108.152.0/21", "124.108.160.0/21", "124.108.172.0/22",
              "124.108.191.0/24", "124.156.200.0/22", "124.156.204.0/22", "124.158.133.0/24", "124.158.134.0/23",
              "124.158.142.0/23", "128.1.113.0/24", "128.1.189.0/24", "128.1.200.0/24", "128.1.63.0/24",
              "128.14.102.0/23", "128.14.136.0/23", "128.14.206.0/24", "128.14.38.0/24", "128.14.63.0/24",
              "128.14.89.0/24", "129.226.144.0/24", "129.226.200.0/22", "129.226.220.0/22", "134.168.233.0/24",
              "134.168.234.0/24", "139.180.158.0/24", "143.92.112.0/23", "143.92.116.0/23", "143.92.118.0/24",
              "143.92.120.0/21", "148.153.101.0/24", "148.153.11.0/24", "148.153.112.0/23", "148.153.116.0/23",
              "148.153.143.0/24", "148.153.168.0/22", "148.153.206.0/23", "148.153.222.0/24", "148.153.246.0/24",
              "148.153.248.0/23", "148.153.67.0/24", "148.153.84.0/23", "148.153.92.0/23", "148.222.64.0/20",
              "148.222.80.0/22", "148.222.84.0/23", "148.222.88.0/21", "149.28.55.0/24", "15.235.220.0/24",
              "15.235.231.0/24", "15.235.233.0/24", "150.109.24.0/22", "150.129.42.0/24", "152.233.63.0/24",
              "154.203.154.0/23", "154.206.73.0/24", "154.223.134.0/23", "154.93.32.0/24", "154.93.46.0/24",
              "154.93.86.0/24", "154.95.68.0/24", "154.95.81.0/24", "156.227.242.0/24", "156.59.144.0/23",
              "156.59.154.0/24", "156.59.194.0/23", "156.59.242.0/23", "156.59.251.0/24", "156.59.64.0/22",
              "156.59.70.0/23", "162.128.241.0/24", "162.128.242.0/24", "162.128.249.0/24", "162.128.32.0/24",
              "162.128.54.0/24", "162.128.61.0/24", "162.128.80.0/24", "162.128.82.0/24", "163.227.196.0/24",
              "163.53.247.0/24", "169.197.96.0/22", "185.23.183.0/24", "192.169.117.0/24", "192.169.124.0/23",
              "193.118.34.0/23", "194.26.72.0/24", "198.44.169.0/24", "199.182.238.0/24", "202.181.64.0/23",
              "202.181.67.0/24", "202.181.68.0/24", "202.181.70.0/23", "202.181.72.0/21", "202.181.80.0/21",
              "202.73.16.0/21", "202.81.100.0/23", "202.81.104.0/21", "202.81.112.0/20", "202.81.96.0/22",
              "204.3.212.0/24", "207.148.69.0/24", "210.17.80.0/24", "23.236.112.0/23", "23.251.37.0/24",
              "23.251.41.0/24", "23.251.51.0/24", "23.251.61.0/24", "23.90.133.0/24", "23.90.134.0/24",
              "23.90.141.0/24", "34.126.122.0/24", "34.126.175.0/24", "34.126.239.0/24", "34.126.81.0/24",
              "34.87.109.0/24", "34.87.170.0/24", "34.87.24.0/24", "35.185.188.0/24", "35.187.246.0/24",
              "35.198.211.0/24", "35.198.221.0/24", "38.54.120.0/24", "38.54.21.0/24", "38.54.44.0/23",
              "38.54.70.0/24", "38.54.78.0/23", "43.128.121.0/24", "43.129.35.0/24", "43.129.43.0/24",
              "43.133.146.0/24", "43.133.150.0/24", "43.133.153.0/24", "43.133.154.0/24", "43.133.40.0/24",
              "43.133.41.0/24", "43.134.101.0/24", "43.134.103.0/24", "43.134.118.0/24", "43.134.168.0/24",
              "43.134.170.0/24", "43.134.182.0/24", "43.134.232.0/24", "43.134.233.0/24", "43.134.241.0/24",
              "43.134.28.0/24", "43.134.45.0/24", "43.134.64.0/24", "43.134.90.0/24", "43.134.94.0/24",
              "43.152.104.0/24", "43.152.105.0/24", "43.153.208.0/24", "43.153.209.0/24", "43.153.215.0/24",
              "43.156.134.0/24", "43.156.14.0/24", "43.156.141.0/24", "43.156.151.0/24", "43.156.167.0/24",
              "43.156.177.0/24", "43.156.199.0/24", "43.156.200.0/24", "43.156.203.0/24", "43.156.205.0/24",
              "43.156.209.0/24", "43.156.26.0/24", "43.156.31.0/24", "43.156.40.0/24", "43.156.7.0/24",
              "43.157.195.0/24", "43.157.197.0/24", "43.157.200.0/24", "43.157.204.0/24", "43.157.206.0/24",
              "43.157.208.0/24", "43.157.209.0/24", "43.157.210.0/24", "43.157.211.0/24", "43.157.224.0/24",
              "43.157.227.0/24", "43.157.228.0/24", "43.157.230.0/24", "43.157.242.0/24", "43.157.250.0/24",
              "43.157.251.0/24", "43.163.105.0/24", "43.163.108.0/24", "43.163.119.0/24", "43.163.126.0/24",
              "43.163.88.0/24", "43.163.96.0/24", "43.173.0.0/23", "43.173.170.0/24", "43.173.171.0/24",
              "43.173.2.0/23", "43.173.29.0/24", "43.252.184.0/22", "43.252.210.0/24", "45.119.216.0/22",
              "45.119.240.0/22", "45.121.212.0/24", "45.251.28.0/22", "59.153.158.0/24", "60.199.50.0/24",
              "66.253.15.0/24", "82.200.131.0/24", "98.96.251.0/24", "98.98.12.0/22", "98.98.140.0/23",
              "98.98.162.0/24", "98.98.189.0/24", "98.98.220.0/23", "98.98.29.0/24", "98.98.32.0/24",
              "98.98.33.0/24", "98.98.34.0/24"
            ],
            "outboundTag": "proxy"
          },
          { "type": "field", "network": "tcp", "port": "39000-39999", "outboundTag": "proxy" },
          { "type": "field", "network": "udp", "port": "10000-10999", "outboundTag": "proxy" },
          {
            "type": "field",
            "domain": [
              "full:event-vodka.freefireind.in", "full:indevent.ggblueshark.com", "full:sgevent.ggblueshark.com",
              "full:meevent.ggblueshark.com", "full:thevent.ggblueshark.com", "full:sacevent.ggblueshark.com",
              "full:idevent.ggblueshark.com", "full:bdevent.ggpolarbear.com", "regexp:event\\.gg(blueshark|polarbear)\\.com$",
              "full:gin.freefireind.in", "full:gin.freefiremobile.com", "full:vodka.freefireind.in",
              "full:dl.castle.freefiremobile.com", "full:dl.cdn.freefiremobile.com", "full:dl-core.cdn.freefiremobile.com",
              "full:dl.gmc.freefiremobile.com", "full:dl.aw.freefiremobile.com", "full:dl.dir.freefiremobile.com",
              "full:dl.bs.freefiremobile.com", "full:dl.ak.freefiremobile.com", "full:dl-sg-production.freefiremobile.com",
              "full:dl-tata.freefireind.in", "full:dl-bs.ggpolarbear.com", "domain:freefiremobile-a.akamaihd.net",
              "full:client.nulldash.store", "full:client.aimhack.shop", "full:client.xreg.store",
              "full:client.trollmodz.store", "full:client.silentx.store", "full:client.zentnityx.store",
              "full:client.ruizenteam.store"
            ],
            "outboundTag": "direct"
          },
          { "type": "field", "network": "tcp,udp", "outboundTag": "direct" }
        ]
      },
      "log": {
        "access": "/data/user/0/com.happproxy/files/logs/access/access_log.txt",
        "error": "/data/user/0/com.happproxy/files/logs/error/error_log.txt"
      }
    };

    res.json(jsonConfig);
});

// --- EMBEDDED MAIN CLIENT WEBSITE HTML ROUTE ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aimhack Proxy Portal</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-white flex items-center justify-center min-h-screen px-4">

    <div class="bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md text-center">
        <h1 class="text-2xl font-bold mb-6 text-red-500 tracking-wide">AIMHACK PORTAL</h1>

        <!-- Login Section -->
        <div id="login-section">
            <label class="block text-sm text-gray-400 mb-2 text-left">Enter License Key</label>
            <input type="text" id="license-key" placeholder="AMHK-XXXX-XXXX-XXXX" 
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white focus:outline-none focus:border-red-500">
            <button onclick="verifyLicense()" class="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition active:scale-95">
                Verify License Key
            </button>
            <p id="error-msg" class="text-red-400 text-sm mt-3"></p>
        </div>

        <!-- Dashboard Section -->
        <div id="dashboard-section" class="hidden">
            <div class="bg-green-900/30 border border-green-500/50 text-green-400 py-2 rounded-lg mb-4 text-sm font-medium">
                License Key Active
