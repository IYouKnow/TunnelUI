import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import { exec, spawn } from 'child_process';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { generateCloudflaredUnit } from './systemd.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Validation functions
const validateApiToken = (token) => {
  if (!token || typeof token !== 'string') return { valid: false, error: 'API token is required' };
  if (token.trim().length === 0) return { valid: false, error: 'API token cannot be empty' };
  if (token.length < 20) return { valid: false, error: 'API token appears to be too short' };
  if (token.length > 255) return { valid: false, error: 'API token appears to be too long' };
  // Cloudflare API tokens typically contain alphanumeric characters and some special chars
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return { valid: false, error: 'API token contains invalid characters' };
  return { valid: true };
};

const validateZoneId = (zoneId) => {
  if (!zoneId || typeof zoneId !== 'string') return { valid: false, error: 'Zone ID is required' };
  if (zoneId.trim().length === 0) return { valid: true }; // Allow empty zone ID
  if (zoneId.length !== 32) return { valid: false, error: 'Zone ID must be exactly 32 characters long' };
  if (!/^[A-Za-z0-9]+$/.test(zoneId)) return { valid: false, error: 'Zone ID must contain only alphanumeric characters' };
  return { valid: true };
};

const validateApiTokenWithCloudflare = async (token) => {
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 401) {
      return { valid: false, error: 'Invalid API token - authentication failed' };
    }
    if (response.status === 403) {
      return { valid: false, error: 'API token lacks required permissions' };
    }
    if (response.ok) {
      return { valid: true };
    }
    return { valid: false, error: 'API token validation failed' };
  } catch (error) {
    return { valid: false, error: 'Network error during API token validation' };
  }
};

const validateZoneIdWithCloudflare = async (zoneId, apiToken) => {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 404) {
      return { valid: false, error: 'Zone ID not found' };
    }
    if (response.status === 401) {
      return { valid: false, error: 'Invalid API token for zone validation' };
    }
    if (response.status === 403) {
      return { valid: false, error: 'API token lacks permission to access this zone' };
    }
    if (response.ok) {
      return { valid: true };
    }
    return { valid: false, error: 'Zone ID validation failed' };
  } catch (error) {
    return { valid: false, error: 'Network error during zone ID validation' };
  }
};

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});

const CLOUDFLARED_CERT_PATH = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cloudflared', 'cert.pem');

let isInstallingCloudflared = false;

app.post('/api/cloudflared/install', async (req, res) => {
  if (isInstallingCloudflared) {
    return res.status(409).json({ error: 'Installation already in progress.' });
  }
  isInstallingCloudflared = true;
  const isRoot = typeof process.getuid === 'function' ? process.getuid() === 0 : false;
  const sudo = isRoot ? '' : 'sudo ';
  const debPath = '/tmp/cloudflared-linux-amd64.deb';
  const installCommands = [
    `${sudo}apt-get update -y`,
    `${sudo}apt-get install -y wget curl gnupg lsb-release`,
    `rm -f ${debPath}`,
    `curl -fsSL -o ${debPath} https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb`,
    `${sudo}dpkg -i ${debPath} || (${sudo}apt-get -y --fix-broken install && ${sudo}dpkg -i ${debPath})`,
    `rm -f ${debPath}`
  ];
  const fullCommand = installCommands.join(' && ');
  exec(fullCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    isInstallingCloudflared = false;
    if (error) {
      return res.status(500).json({ error: error.message, stdout, stderr });
    }
    res.json({ success: true, stdout, stderr });
  });
});

// Update cloudflared to latest (same flow as install)
app.post('/api/cloudflared/update', async (req, res) => {
  if (isInstallingCloudflared) {
    return res.status(409).json({ error: 'Another install/update is in progress.' });
  }
  isInstallingCloudflared = true;
  const isRoot = typeof process.getuid === 'function' ? process.getuid() === 0 : false;
  const sudo = isRoot ? '' : 'sudo ';
  const debPath = '/tmp/cloudflared-linux-amd64.deb';
  const installCommands = [
    `${sudo}apt-get update -y`,
    `${sudo}apt-get install -y wget curl gnupg lsb-release`,
    `rm -f ${debPath}`,
    `curl -fsSL -o ${debPath} https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb`,
    `${sudo}dpkg -i ${debPath} || (${sudo}apt-get -y --fix-broken install && ${sudo}dpkg -i ${debPath})`,
    `rm -f ${debPath}`
  ];
  const fullCommand = installCommands.join(' && ');
  exec(fullCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    isInstallingCloudflared = false;
    if (error) {
      return res.status(500).json({ error: error.message, stdout, stderr });
    }
    res.json({ success: true, stdout, stderr });
  });
});

// Endpoint to check if cloudflared is installed
app.get('/api/cloudflared/package-status', (req, res) => {
  // First check using which
  exec('which cloudflared', (error, whichStdout) => {
    if (!error && whichStdout) {
      // Found via which, definitely installed
      return res.json({ installed: true, path: whichStdout.trim() });
    }
    
    // If not found with which, check dpkg
    exec("dpkg -l | grep -i cloudflared", (error, dpkgStdout) => {
      if (!error && dpkgStdout) {
        // Found via dpkg
        return res.json({ installed: true, info: dpkgStdout.trim() });
      }
      
      // Last try - check apt
      exec("apt list --installed | grep -i cloudflared", (error, aptStdout) => {
        if (!error && aptStdout) {
          // Found via apt
          return res.json({ installed: true, info: aptStdout.trim() });
        }
        
        // Not found anywhere
        res.json({ installed: false });
      });
    });
  });
});

// Unified status: cloudflared installed/version and active tunnels
app.get('/api/status', async (req, res) => {
  try {
    // Determine install status via which
    exec('which cloudflared', async (error, whichStdout) => {
      const installed = !error && Boolean(whichStdout && whichStdout.trim());

      // Try to get version if installed
      let version = null;
      if (installed) {
        await new Promise((resolve) => {
          exec('cloudflared --version', (verErr, stdout, stderr) => {
            const text = `${stdout || ''} ${stderr || ''}`;
            const match = text.match(/\b(\d{4}\.\d+\.\d+)\b/);
            if (match) version = match[1];
            resolve();
          });
        });
      }

      // Fetch latest version from GitHub (best effort)
      let latestVersion = null;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const resp = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', { signal: controller.signal, headers: { 'User-Agent': 'cf-gui' } });
        clearTimeout(timer);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.tag_name) {
            // tag_name might be like '2025.8.0' or 'v2025.8.0'
            latestVersion = String(data.tag_name).replace(/^v/i, '');
          }
        }
      } catch {}

      function parseParts(v) {
        const parts = (v || '').split('.').map(n => parseInt(n, 10));
        while (parts.length < 3) parts.push(0);
        return parts.slice(0,3).map(n => (isNaN(n) ? 0 : n));
      }
      function isUpToDate(current, latest) {
        if (!current || !latest) return true; // if unknown, do not alarm
        const [a,b,c] = parseParts(current);
        const [x,y,z] = parseParts(latest);
        if (a !== x) return a > x;
        if (b !== y) return b >= y;
        return c >= z;
      }

      // Count active tunnels from DB by status
      let activeTunnels = 0;
      try {
        const [rows] = await db.query("SELECT COUNT(*) as cnt FROM tunnels WHERE status = 'running'");
        activeTunnels = rows && rows[0] ? Number(rows[0].cnt) : 0;
      } catch {}

      const upToDate = isUpToDate(version, latestVersion);
      res.json({ installed, version, latestVersion, upToDate, activeTunnels });
    });
  } catch (err) {
    res.status(500).json({ installed: false, version: null, latestVersion: null, upToDate: true, activeTunnels: 0 });
  }
});

app.get('/api/domains', async (req, res) => {
  const { account_id } = req.query;
  try {
    let rows;
    if (account_id) {
      [rows] = await db.query('SELECT * FROM domains WHERE account_id = ?', [account_id]);
    } else {
      [rows] = await db.query('SELECT * FROM domains');
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching domains', details: err.message });
  }
});

app.post('/api/cloudflared/login', async (req, res) => {
  const { name } = req.body;
  if (!name || /\s/.test(name)) {
    return res.status(400).json({ error: 'Account name is required and cannot contain spaces.' });
  }
  const accountDir = path.join(process.env.HOME || process.env.USERPROFILE || '', `.cloudflared/${name}`);
  const certTarget = path.join(accountDir, 'cert.pem');
  const child = spawn('cloudflared', ['tunnel', 'login']);
  let url = '';
  let output = '';
  let responded = false;

  function tryRespond() {
    if (!responded) {
      // Find a login URL in the output
      const match = output.match(/https?:\/\/.*cloudflare.com\/.*\b/);
      if (match) {
        url = match[0];
        responded = true;
        res.json({ url, output });
        // Do not kill the process here! Let it run to complete the login.
        return true;
      }
    }
    return false;
  }

  child.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    tryRespond();
  });

  child.stderr.on('data', (data) => {
    output += data.toString();
    tryRespond();
  });

  child.on('close', (code) => {
    // When the process ends, move cert.pem to the account directory
    fs.access(CLOUDFLARED_CERT_PATH, fs.constants.F_OK, (err) => {
      if (!err) {
        fs.mkdir(accountDir, { recursive: true }, (err) => {
          if (err) {
            console.error('Error creating account directory:', err);
            return;
          }
          fs.rename(CLOUDFLARED_CERT_PATH, certTarget, (err) => {
            if (err) console.error('Error moving cert.pem:', err);
          });
        });
      }
    });
  });

  child.on('error', (err) => {
    if (!responded) {
      responded = true;
      res.status(500).json({ error: err.message, output });
    }
  });

  // Only return timeout if there is no URL in the output after 30 seconds
  setTimeout(() => {
    if (!responded) {
      if (!tryRespond()) {
        responded = true;
        res.status(504).json({ error: 'Timeout obtaining login URL', output });
        child.kill();
      }
    }
  }, 30000);
});

// Endpoint to check if cert.pem was created
app.get('/api/cloudflared/cert-status', (req, res) => {
  const name = req.query.name;
  let certPath;
  if (name) {
    certPath = path.join(process.env.HOME || process.env.USERPROFILE || '', `.cloudflared/${name}/cert.pem`);
  } else {
    certPath = CLOUDFLARED_CERT_PATH; // fallback legacy
  }
  fs.stat(certPath, (err, stats) => {
    if (err) {
      return res.json({ exists: false });
    }
    res.json({ exists: true, mtime: stats.mtime });
  });
});

// Add domain
app.post('/api/domains', async (req, res) => {
  const { account_id, domain, zone_id } = req.body;
  if (!account_id || !domain) {
    return res.status(400).json({ error: 'account_id and domain are required.' });
  }
  
  // Validate zone ID if provided
  if (zone_id) {
    const zoneValidation = validateZoneId(zone_id);
    if (!zoneValidation.valid) {
      return res.status(400).json({ error: zoneValidation.error });
    }
    
    // Optional: Validate zone ID with Cloudflare API if API token is available
    if (process.env.VALIDATE_ZONE_ID === 'true') {
      try {
        const [[account]] = await db.query('SELECT api_token FROM accounts WHERE id = ?', [account_id]);
        if (account && account.api_token) {
          const cloudflareValidation = await validateZoneIdWithCloudflare(zone_id, account.api_token);
          if (!cloudflareValidation.valid) {
            return res.status(400).json({ error: cloudflareValidation.error });
          }
        }
      } catch (err) {
        console.error('Error validating zone ID with Cloudflare:', err);
        // Continue without validation if there's an error
      }
    }
  }
  
  try {
    await db.query('INSERT INTO domains (account_id, domain, zone_id) VALUES (?, ?, ?)', [account_id, domain, zone_id || null]);
    res.status(201).json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Domain already exists.' });
    } else {
      res.status(500).json({ error: 'Error adding domain.', details: err.message });
    }
  }
});

// Remove domain
app.delete('/api/domains/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM domains WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error removing domain.', details: err.message });
  }
});

// Edit domain
app.put('/api/domains/:id', async (req, res) => {
  const { id } = req.params;
  const { domain, zone_id, account_id } = req.body;
  if (!domain || !account_id) return res.status(400).json({ error: 'domain and account_id are required.' });
  
  // Validate zone ID if provided
  if (zone_id) {
    const zoneValidation = validateZoneId(zone_id);
    if (!zoneValidation.valid) {
      return res.status(400).json({ error: zoneValidation.error });
    }
    
    // Optional: Validate zone ID with Cloudflare API if API token is available
    if (process.env.VALIDATE_ZONE_ID === 'true') {
      try {
        const [[account]] = await db.query('SELECT api_token FROM accounts WHERE id = ?', [account_id]);
        if (account && account.api_token) {
          const cloudflareValidation = await validateZoneIdWithCloudflare(zone_id, account.api_token);
          if (!cloudflareValidation.valid) {
            return res.status(400).json({ error: cloudflareValidation.error });
          }
        }
      } catch (err) {
        console.error('Error validating zone ID with Cloudflare:', err);
        // Continue without validation if there's an error
      }
    }
  }
  
  try {
    await db.query('UPDATE domains SET domain = ?, zone_id = ?, account_id = ? WHERE id = ?', [domain, zone_id || null, account_id, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error editing domain.', details: err.message });
  }
});

// Endpoint to add tunnel
app.post('/api/tunnels', async (req, res) => {
  const { name, domain, service, status, account_id, force, tunnelId: providedTunnelId, noTLSVerify, isTemporary } = req.body;
  console.log('Received request to create tunnel:', { name, domain, service, status, account_id, force, tunnelId: providedTunnelId, isTemporary });
  if (!name || !domain || !service || !account_id) {
    console.log('Missing required fields');
    return res.status(400).json({ error: 'Required fields: name, domain, service, account_id.' });
  }
  try {
    // Find the account name by id
    const [[account]] = await db.query('SELECT name FROM accounts WHERE id = ?', [account_id]);
    if (!account) {
      console.log('Account not found for id:', account_id);
      return res.status(404).json({ error: 'Account not found.' });
    }
    const accountName = account.name;
    const accountDir = path.join(process.env.HOME || process.env.USERPROFILE || '', `.cloudflared/${accountName}`);
    const certPath = path.join(accountDir, 'cert.pem');
    console.log('Using cert.pem:', certPath);

    // If force and tunnelId provided, skip tunnel creation and use the provided tunnelId
    if (force && providedTunnelId) {
      const tunnelId = providedTunnelId;
      const { replaceDns } = req.body;

      if (replaceDns) {
        try {
          const [allDomains] = await db.query('SELECT domain, zone_id, account_id FROM domains WHERE account_id = ?', [account_id]);
          let foundDomain = null;
          for (const d of allDomains) {
            if (domain === d.domain || domain.endsWith('.' + d.domain)) {
              if (!foundDomain || d.domain.length > foundDomain.domain.length) {
                foundDomain = d;
              }
            }
          }

          if (foundDomain && foundDomain.zone_id && typeof foundDomain.zone_id === 'string' && foundDomain.zone_id.trim()) {
            const [[accountWithToken]] = await db.query('SELECT api_token FROM accounts WHERE id = ?', [account_id]);
            if (accountWithToken && accountWithToken.api_token) {
              const listUrl = `https://api.cloudflare.com/client/v4/zones/${foundDomain.zone_id}/dns_records?name=${encodeURIComponent(domain)}`;
              const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${accountWithToken.api_token}`, 'Content-Type': 'application/json' } });
              const listData = await listResp.json();
              if (listData.success && listData.result) {
                for (const record of listData.result) {
                  const delUrl = `https://api.cloudflare.com/client/v4/zones/${foundDomain.zone_id}/dns_records/${record.id}`;
                  await fetch(delUrl, { method: 'DELETE', headers: { 'Authorization': `Bearer ${accountWithToken.api_token}`, 'Content-Type': 'application/json' } });
                }
              }
            } else {
              return res.status(500).json({ error: 'Cannot replace DNS record: API Token for the account is not configured.' });
            }
          } else {
            return res.status(500).json({ error: 'Cannot replace DNS record: Zone ID for the domain is not configured.' });
          }
        } catch (err) {
          return res.status(500).json({ error: 'An error occurred while trying to replace the DNS record.', details: err.message });
        }
      }
      
      // Generate config.yml
      try {
        const config = {
          tunnel: tunnelId,
          'credentials-file': path.join(accountDir, `${tunnelId}.json`),
          ingress: [
            noTLSVerify
              ? { hostname: domain, service: service, originRequest: { noTLSVerify: true } }
              : { hostname: domain, service: service },
            { service: 'http_status:404' }
          ]
        };
        const configPath = path.join(accountDir, `config-${tunnelId}.yml`);
        fs.writeFileSync(configPath, yaml.dump(config), 'utf8');
        console.log('Config.yml created at:', configPath);
        // Route DNS (try again, but ignore errors)
        const routeCmd = ['tunnel', 'route', 'dns', name, domain];
        const env = { ...process.env, TUNNEL_ORIGIN_CERT: certPath };
        let routeError = '';
        const routeProc = spawn('cloudflared', routeCmd, { env });
        routeProc.stderr.on('data', data => { routeError += data.toString(); });
        routeProc.on('close', async () => {
          let dnsWarning = null;
          if (routeError.includes('A, AAAA, or CNAME record with that host already exists')) {
            dnsWarning = 'DNS record was not created automatically. Please check your DNS settings.';
          }
          // If we replaced the DNS, there should be no warning.
          if (replaceDns) {
            dnsWarning = null;
          }
          // Insert tunnel into the database
          try {
            await db.query(
              'INSERT INTO tunnels (cloudflare_id, name, domain, service, status, account_id, dns_warning, no_tls_verify, is_temporary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [tunnelId, name, domain, service, 'stopped', account_id, dnsWarning, noTLSVerify, isTemporary || false]
            );
            console.log('Tunnel inserted into database successfully (force):', tunnelId);
            
            // Get the database ID of the inserted tunnel
            const [[insertedTunnel]] = await db.query('SELECT id FROM tunnels WHERE cloudflare_id = ?', [tunnelId]);
            
            res.status(201).json({ success: true, tunnelId, id: insertedTunnel.id });
            // After successfully inserting the tunnel into the database:
            try {
              // Generate systemd unit file
              const user = process.env.USER || 'root';
              const unitContent = generateCloudflaredUnit({ tunnelId, user, configPath });
              const unitFileName = `cloudflared-tunnel@${tunnelId}.service`;
              const unitPath = path.join(__dirname, unitFileName);
              fs.writeFileSync(unitPath, unitContent, 'utf8');
              // Copy to /etc/systemd/system/
              const destPath = `/etc/systemd/system/${unitFileName}`;
              fs.copyFileSync(unitPath, destPath);
              // systemctl daemon-reload
              await new Promise((resolve, reject) => {
                exec('systemctl daemon-reload', (error, stdout, stderr) => {
                  if (error) return reject(stderr || error.message);
                  resolve();
                });
              });
              // Auto-start temporary tunnels
              if (isTemporary) {
                await new Promise((resolve) => {
                  exec(`systemctl start cloudflared-tunnel@${tunnelId}`, () => resolve());
                });
                await db.query('UPDATE tunnels SET status = ? WHERE id = ?', ['running', insertedTunnel.id]);
              }
            } catch (err) {
              console.error('Error configuring systemd for tunnel:', err);
            }
          } catch (err) {
            console.log('Error creating config.yml or inserting tunnel:', err);
            res.status(500).json({ error: 'Error creating config.yml or inserting tunnel.', details: err.message });
          }
        });
      } catch (err) {
        console.log('Error creating config.yml or inserting tunnel:', err);
        res.status(500).json({ error: 'Error creating config.yml or inserting tunnel.', details: err.message });
      }
      return;
    }
    // Execute cloudflared tunnel create command
    const child = spawn('cloudflared', ['tunnel', '--origincert', certPath, 'create', name]);
    let output = '';
    let tunnelId = null;
    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('[cloudflared stdout]', text);
      // Find the tunnel ID in the output
      const match = output.match(/Tunnel credentials written to (.+\/)?([a-f0-9\-]+)\.json/);
      if (match) {
        tunnelId = match[2];
        console.log('Tunnel ID captured:', tunnelId);
      }
    });
    child.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('[cloudflared stderr]', text);
    });
    child.on('close', async (code) => {
      console.log('cloudflared finished with code:', code);
      if (code !== 0 || !tunnelId) {
        console.log('Error creating Cloudflare tunnel:', output);
        // Check if the error is because the tunnel name already exists
        if (output.includes('A tunnel with that name already exists')) {
          return res.status(409).json({ error: 'A tunnel with that name already exists.', details: output });
        }
        return res.status(500).json({ error: 'Error creating Cloudflare tunnel', details: output });
      }

      try {
        // Generate config.yml
        const config = {
          tunnel: tunnelId,
          'credentials-file': path.join(accountDir, `${tunnelId}.json`),
          ingress: [
            noTLSVerify
              ? { hostname: domain, service: service, originRequest: { noTLSVerify: true } }
              : { hostname: domain, service: service },
            { service: 'http_status:404' }
          ]
        };
        const configPath = path.join(accountDir, `config-${tunnelId}.yml`);
        fs.writeFileSync(configPath, yaml.dump(config), 'utf8');
        console.log('Config.yml created at:', configPath);

        // Attempt to route DNS, this will also check for existing records
        const routeCmd = ['tunnel', 'route', 'dns', name, domain];
        const env = { ...process.env, TUNNEL_ORIGIN_CERT: certPath };
        const routeProc = spawn('cloudflared', routeCmd, { env });
        let routeError = '';
        routeProc.stderr.on('data', data => { routeError += data.toString(); });

        routeProc.on('close', async (routeCode) => {
          const alreadyExistsMsg = 'A, AAAA, or CNAME record with that host already exists';

          if (routeError.includes(alreadyExistsMsg)) {
            // DNS record exists, return 409 to ask the user for confirmation
            return res.status(409).json({
              dnsRecordExists: true,
              tunnelId: tunnelId,
              message: `A DNS record for ${domain} already exists. Please choose how to proceed.`
            });
          }

          if (routeCode !== 0) {
            // Another error occurred during DNS routing
            console.error('Error routing DNS:', routeError);
            return res.status(500).json({ error: 'Error creating DNS route for the tunnel.', details: routeError });
          }

          // DNS record created successfully, now add to the database
          try {
            await db.query(
              'INSERT INTO tunnels (cloudflare_id, name, domain, service, status, account_id, dns_warning, no_tls_verify, is_temporary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [tunnelId, name, domain, service, 'stopped', account_id, null, noTLSVerify, isTemporary || false]
            );
            console.log('Tunnel inserted into database successfully:', tunnelId);
            
            // Get the database ID of the inserted tunnel
            const [[insertedTunnel]] = await db.query('SELECT id FROM tunnels WHERE cloudflare_id = ?', [tunnelId]);
            
            res.status(201).json({ success: true, tunnelId, id: insertedTunnel.id });

            // After successfully inserting the tunnel into the database:
            try {
              // Generate systemd unit file
              const user = process.env.USER || 'root';
              const unitContent = generateCloudflaredUnit({ tunnelId, user, configPath });
              const unitFileName = `cloudflared-tunnel@${tunnelId}.service`;
              const unitPath = path.join(__dirname, unitFileName);
              fs.writeFileSync(unitPath, unitContent, 'utf8');
              // Copy to /etc/systemd/system/
              const destPath = `/etc/systemd/system/${unitFileName}`;
              fs.copyFileSync(unitPath, destPath);
              // systemctl daemon-reload
              await new Promise((resolve, reject) => {
                exec('systemctl daemon-reload', (error, stdout, stderr) => {
                  if (error) return reject(stderr || error.message);
                  resolve();
                });
              });
              // Auto-start temporary tunnels
              if (isTemporary) {
                await new Promise((resolve) => {
                  exec(`systemctl start cloudflared-tunnel@${tunnelId}`, () => resolve());
                });
                await db.query('UPDATE tunnels SET status = ? WHERE id = ?', ['running', insertedTunnel.id]);
              }
            } catch (err) {
              console.error('Error configuring systemd for tunnel:', err);
              // Do not return error to the user, but log for debug
            }
          } catch (err) {
            console.log('Error inserting tunnel into database:', err);
            // If DB insert fails, we should ideally clean up the created DNS route.
            // For now, we'll just log the error.
            res.status(500).json({ error: 'Error inserting tunnel into database.', details: err.message });
          }
        });
      } catch (err) {
        console.log('Error creating config.yml or routing DNS:', err);
        res.status(500).json({ error: 'Error processing tunnel.', details: err.message });
      }
    });
  } catch (err) {
    console.log('Unexpected error in /api/tunnels endpoint:', err);
    res.status(500).json({ error: 'Error creating tunnel.', details: err.message });
  }
});

// Endpoint to check tunnel name availability
app.get('/api/tunnels/check-name', async (req, res) => {
  const { name, account_id } = req.query;

  if (!name || !account_id) {
    return res.status(400).json({ error: 'Tunnel name and account ID are required.' });
  }

  try {
    // 1. Check local database first
    const [[existing]] = await db.query('SELECT id FROM tunnels WHERE name = ?', [name]);
    if (existing) {
      return res.json({
        exists: true,
        message: 'Name already exists in the local database.'
      });
    }

    // 2. Check Cloudflare via CLI
    const [[account]] = await db.query('SELECT name FROM accounts WHERE id = ?', [account_id]);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const accountName = account.name;
    const accountDir = path.join(process.env.HOME || process.env.USERPROFILE || '', `.cloudflared/${accountName}`);
    const certPath = path.join(accountDir, 'cert.pem');

    if (!fs.existsSync(certPath)) {
      // If cert doesn't exist, we can't check, so we assume it's available on CF side
      // The creation will fail later if it's not, which is acceptable.
      return res.json({ exists: false });
    }

    const child = spawn('cloudflared', ['tunnel', 'list', '--origincert', certPath]);
    let output = '';
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { output += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        // Can't check, assume available. The create step will provide the final validation.
        return res.json({ exists: false });
      }

      // Parse the output to find the name.
      // The output is a table, we check the second column for an exact match.
      const lines = output.trim().split('\n').slice(1); // ignore header
      const nameExists = lines.some(line => {
        const columns = line.trim().split(/\s+/);
        return columns.length > 1 && columns[1] === name;
      });

      if (nameExists) {
        res.json({
          exists: true,
          message: 'Name already exists on Cloudflare for this account.'
        });
      } else {
        res.json({ exists: false });
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Error checking tunnel name.', details: err.message });
  }
});


// Endpoint to start tunnel via systemd
app.post('/api/tunnels/:id/start', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    exec(`systemctl start cloudflared-tunnel@${tunnel.cloudflare_id}`, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: 'Error starting tunnel via systemd', details: stderr || error.message });
      }
      // Update status and set uptime_started_at to current timestamp
      const now = new Date();
      db.query('UPDATE tunnels SET status = ?, uptime_started_at = ?, last_activity_at = ? WHERE id = ?', 
        ['running', now, now, tunnelId]);
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error starting tunnel.', details: err.message });
  }
});

// Endpoint to stop tunnel via systemd
app.post('/api/tunnels/:id/stop', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    exec(`systemctl stop cloudflared-tunnel@${tunnel.cloudflare_id}`, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: 'Error stopping tunnel via systemd', details: stderr || error.message });
      }
      // Update status and clear uptime_started_at (tunnel is no longer running)
      const now = new Date();
      db.query('UPDATE tunnels SET status = ?, uptime_started_at = NULL, last_activity_at = ? WHERE id = ?', 
        ['stopped', now, tunnelId]);
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error stopping tunnel.', details: err.message });
  }
});

// Endpoint to restart tunnel via systemd
app.post('/api/tunnels/:id/restart', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    exec(`systemctl restart cloudflared-tunnel@${tunnel.cloudflare_id}`, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: 'Error restarting tunnel via systemd', details: stderr || error.message });
      }
      // Check if the service is running after restart
      exec(`systemctl is-active cloudflared-tunnel@${tunnel.cloudflare_id}`, (error2, stdout2, stderr2) => {
        const isRunning = stdout2.trim() === 'active';
        const now = new Date();
        if (isRunning) {
          // Tunnel is running, set uptime_started_at and update last_activity_at
          db.query('UPDATE tunnels SET status = ?, uptime_started_at = ?, last_activity_at = ? WHERE id = ?', 
            ['running', now, now, tunnelId]);
        } else {
          // Tunnel failed to start, clear uptime_started_at
          db.query('UPDATE tunnels SET status = ?, uptime_started_at = NULL, last_activity_at = ? WHERE id = ?', 
            ['stopped', now, tunnelId]);
        }
        res.json({ success: true, status: isRunning ? 'running' : 'stopped' });
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error restarting tunnel.', details: err.message });
  }
});

// Endpoint to get tunnel status via systemd
app.get('/api/tunnels/:id/status', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    exec(`systemctl is-active cloudflared-tunnel@${tunnel.cloudflare_id}`, (error, stdout, stderr) => {
      if (error) {
        return res.json({ status: 'stopped' });
      }
      const status = stdout.trim() === 'active' ? 'running' : 'stopped';
      res.json({ status });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error querying tunnel status.', details: err.message });
  }
});

// Tunnel diagnostics: systemd active state and recent logs
app.get('/api/tunnels/:id/logs', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.* FROM tunnels t WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    const unit = `cloudflared-tunnel@${tunnel.cloudflare_id}`;
    exec(`journalctl -u ${unit} -n 200 --no-pager`, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: 'Error reading logs', details: stderr || error.message });
      }
      res.json({ unit, logs: stdout });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching logs.', details: err.message });
  }
});

app.get('/api/tunnels/:id/health', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.* FROM tunnels t WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    const unit = `cloudflared-tunnel@${tunnel.cloudflare_id}`;
    exec(`systemctl is-active ${unit}`, (error, stdout) => {
      const isActive = !error && stdout.trim() === 'active';
      res.json({ unit, isActive });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error checking health.', details: err.message });
  }
});

// Endpoint to update tunnel
app.put('/api/tunnels/:id', async (req, res) => {
  const tunnelId = req.params.id;
  const { name, domain, service, account_id, noTLSVerify, force, replaceDns } = req.body;
  
  if (!name || !domain || !service || !account_id) {
    return res.status(400).json({ error: 'Required fields: name, domain, service, account_id.' });
  }

  try {
    // Get existing tunnel
    const [[tunnel]] = await db.query('SELECT * FROM tunnels WHERE id = ?', [tunnelId]);
    if (!tunnel) {
      return res.status(404).json({ error: 'Tunnel not found.' });
    }

    // Get account info
    const [[account]] = await db.query('SELECT name FROM accounts WHERE id = ?', [account_id]);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const accountDir = path.join(process.env.HOME || process.env.USERPROFILE || '', `.cloudflared/${account.name}`);
    const configPath = path.join(accountDir, `config-${tunnel.cloudflare_id}.yml`);
    const certPath = path.join(accountDir, 'cert.pem');

    // Check if domain has changed
    const domainChanged = tunnel.domain !== domain;

    // If domain changed and not forcing, check for DNS record conflicts and handle DNS changes
    if (domainChanged && !force) {
      // Check if DNS record exists for the new domain
      const routeCmd = ['tunnel', 'route', 'dns', name, domain];
      const env = { ...process.env, TUNNEL_ORIGIN_CERT: certPath };
      const routeProc = spawn('cloudflared', routeCmd, { env });
      let routeError = '';
      
      routeProc.stderr.on('data', data => { routeError += data.toString(); });
      
      routeProc.on('close', async (routeCode) => {
        const alreadyExistsMsg = 'A, AAAA, or CNAME record with that host already exists';
        
        if (routeError.includes(alreadyExistsMsg)) {
          // DNS record exists for new domain, return 409 to ask the user for confirmation
          return res.status(409).json({
            dnsRecordExists: true,
            tunnelId: tunnel.cloudflare_id,
            message: `A DNS record for ${domain} already exists. Please choose how to proceed.`,
            oldDomain: tunnel.domain,
            newDomain: domain
          });
        }
        
        // No DNS conflict for new domain, but we need to handle the old domain's DNS record
        // Check if old domain has a DNS record that needs to be removed
        const oldDomainHasDns = await checkDomainHasDnsRecord(tunnel.domain, account_id);
        
        if (oldDomainHasDns) {
          // Old domain has DNS record, ask user what to do
          return res.status(409).json({
            dnsRecordExists: false,
            oldDomainHasDns: true,
            tunnelId: tunnel.cloudflare_id,
            message: `The old domain ${tunnel.domain} has a DNS record. Do you want to remove it and create a new one for ${domain}?`,
            oldDomain: tunnel.domain,
            newDomain: domain
          });
        }
        
        // No conflicts, proceed with normal update
        await performTunnelUpdate();
      });
    } else {
      // No domain change or forcing, proceed with normal update
      await performTunnelUpdate();
    }

    async function checkDomainHasDnsRecord(domainToCheck, accountId) {
      try {
        const [allDomains] = await db.query('SELECT domain, zone_id, account_id FROM domains WHERE account_id = ?', [accountId]);
        let foundDomain = null;
        for (const d of allDomains) {
          if (domainToCheck === d.domain || domainToCheck.endsWith('.' + d.domain)) {
            if (!foundDomain || d.domain.length > foundDomain.domain.length) {
              foundDomain = d;
            }
          }
        }

        if (foundDomain && foundDomain.zone_id && typeof foundDomain.zone_id === 'string' && foundDomain.zone_id.trim()) {
          const [[accountWithToken]] = await db.query('SELECT api_token FROM accounts WHERE id = ?', [accountId]);
          if (accountWithToken && accountWithToken.api_token) {
            const listUrl = `https://api.cloudflare.com/client/v4/zones/${foundDomain.zone_id}/dns_records?name=${encodeURIComponent(domainToCheck)}`;
            const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${accountWithToken.api_token}`, 'Content-Type': 'application/json' } });
            const listData = await listResp.json();
            return listData.success && listData.result && listData.result.length > 0;
          }
        }
        return false;
      } catch (err) {
        console.error('Error checking DNS record:', err);
        return false;
      }
    }

    async function performTunnelUpdate() {
      try {
        // Handle DNS replacement if requested
        if (force && replaceDns) {
          try {
            // Remove old domain DNS record if it exists
            const oldDomainHasDns = await checkDomainHasDnsRecord(tunnel.domain, account_id);
            if (oldDomainHasDns) {
              await removeDnsRecord(tunnel.domain, account_id);
            }

            // Create new domain DNS record
            const routeCmd = ['tunnel', 'route', 'dns', name, domain];
            const env = { ...process.env, TUNNEL_ORIGIN_CERT: certPath };
            const routeProc = spawn('cloudflared', routeCmd, { env });
            
            routeProc.on('close', async (routeCode) => {
              if (routeCode !== 0) {
                console.error('Error creating DNS route for new domain');
              }
            });
          } catch (err) {
            console.error('Error handling DNS replacement:', err);
          }
        } else if (force && !replaceDns) {
          // Proceed Anyway: Create new DNS record without removing the old one
          try {
            const routeCmd = ['tunnel', 'route', 'dns', name, domain];
            const env = { ...process.env, TUNNEL_ORIGIN_CERT: certPath };
            const routeProc = spawn('cloudflared', routeCmd, { env });
            
            routeProc.on('close', async (routeCode) => {
              if (routeCode !== 0) {
                console.error('Error creating DNS route for new domain');
              }
            });
          } catch (err) {
            console.error('Error creating DNS route for new domain:', err);
          }
        }

        // Update config file
        const config = {
          tunnel: tunnel.cloudflare_id,
          'credentials-file': path.join(accountDir, `${tunnel.cloudflare_id}.json`),
          ingress: [
            noTLSVerify
              ? { hostname: domain, service: service, originRequest: { noTLSVerify: true } }
              : { hostname: domain, service: service },
            { service: 'http_status:404' }
          ]
        };
        fs.writeFileSync(configPath, yaml.dump(config), 'utf8');

        // Update database
        await db.query(
          'UPDATE tunnels SET name = ?, domain = ?, service = ?, account_id = ?, no_tls_verify = ? WHERE id = ?',
          [name, domain, service, account_id, noTLSVerify, tunnelId]
        );

        // Reload systemd service if running
        exec(`systemctl restart cloudflared-tunnel@${tunnel.cloudflare_id}`, (error, stdout, stderr) => {
          if (error) {
            console.error('Error restarting tunnel:', error, stderr);
            return res.status(500).json({ error: 'Error restarting tunnel', details: stderr || error.message });
          }
          res.json({ success: true });
        });
      } catch (err) {
        res.status(500).json({ error: 'Error updating tunnel.', details: err.message });
      }
    }

    async function removeDnsRecord(domainToRemove, accountId) {
      try {
        const [allDomains] = await db.query('SELECT domain, zone_id, account_id FROM domains WHERE account_id = ?', [accountId]);
        let foundDomain = null;
        for (const d of allDomains) {
          if (domainToRemove === d.domain || domainToRemove.endsWith('.' + d.domain)) {
            if (!foundDomain || d.domain.length > foundDomain.domain.length) {
              foundDomain = d;
            }
          }
        }

        if (foundDomain && foundDomain.zone_id && typeof foundDomain.zone_id === 'string' && foundDomain.zone_id.trim()) {
          const [[accountWithToken]] = await db.query('SELECT api_token FROM accounts WHERE id = ?', [accountId]);
          if (accountWithToken && accountWithToken.api_token) {
            const listUrl = `https://api.cloudflare.com/client/v4/zones/${foundDomain.zone_id}/dns_records?name=${encodeURIComponent(domainToRemove)}`;
            const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${accountWithToken.api_token}`, 'Content-Type': 'application/json' } });
            const listData = await listResp.json();
            if (listData.success && listData.result) {
              for (const record of listData.result) {
                const delUrl = `https://api.cloudflare.com/client/v4/zones/${foundDomain.zone_id}/dns_records/${record.id}`;
                await fetch(delUrl, { method: 'DELETE', headers: { 'Authorization': `Bearer ${accountWithToken.api_token}`, 'Content-Type': 'application/json' } });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error removing DNS record:', err);
      }
    }
  } catch (err) {
    res.status(500).json({ error: 'Error updating tunnel.', details: err.message });
  }
});

// Endpoint to list tunnels
app.get('/api/tunnels', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tunnels');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching tunnels', details: err.message });
  }
});

// Endpoint to list accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM accounts');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching accounts', details: err.message });
  }
});

// Endpoint to add account
app.post('/api/accounts', async (req, res) => {
  const { name, description, api_token } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Account name is required.' });
  }
  
  // Validate API token if provided
  if (api_token) {
    const tokenValidation = validateApiToken(api_token);
    if (!tokenValidation.valid) {
      return res.status(400).json({ error: tokenValidation.error });
    }
    
    // Optional: Validate with Cloudflare API (can be disabled for performance)
    if (process.env.VALIDATE_API_TOKEN === 'true') {
      const cloudflareValidation = await validateApiTokenWithCloudflare(api_token);
      if (!cloudflareValidation.valid) {
        return res.status(400).json({ error: cloudflareValidation.error });
      }
    }
  }
  
  try {
    await db.query('INSERT INTO accounts (name, description, api_token) VALUES (?, ?, ?)', [name, description || null, api_token || null]);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error adding account.', details: err.message });
  }
});

// Endpoint to edit account
app.put('/api/accounts/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, api_token } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Account name is required.' });
  }
  
  // Validate API token if provided
  if (api_token) {
    const tokenValidation = validateApiToken(api_token);
    if (!tokenValidation.valid) {
      return res.status(400).json({ error: tokenValidation.error });
    }
    
    // Optional: Validate with Cloudflare API (can be disabled for performance)
    if (process.env.VALIDATE_API_TOKEN === 'true') {
      const cloudflareValidation = await validateApiTokenWithCloudflare(api_token);
      if (!cloudflareValidation.valid) {
        return res.status(400).json({ error: cloudflareValidation.error });
      }
    }
  }
  
  try {
    await db.query('UPDATE accounts SET name = ?, description = ?, api_token = ? WHERE id = ?', [name, description || null, api_token || null, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error editing account.', details: err.message });
  }
});

// Endpoint to create systemd unit file for the tunnel
app.post('/api/tunnels/:id/systemd', async (req, res) => {
  const tunnelId = req.params.id;
  const user = req.body.user || process.env.USER || 'root';
  try {
    const [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    const configPath = path.join(process.env.HOME || process.env.USERPROFILE || '', `.cloudflared/${tunnel.account_name}/config-${tunnel.cloudflare_id}.yml`);
    const unitContent = generateCloudflaredUnit({ tunnelId: tunnel.cloudflare_id, user, configPath });
    const unitPath = path.join(__dirname, `cloudflared-tunnel@${tunnel.cloudflare_id}.service`);
    fs.writeFileSync(unitPath, unitContent, 'utf8');
    res.json({ success: true, unitPath });
  } catch (err) {
    res.status(500).json({ error: 'Error creating systemd unit file.', details: err.message });
  }
});

// Endpoint to remove systemd unit file for the tunnel
app.delete('/api/tunnels/:id/systemd', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    const unitPath = path.join(__dirname, `cloudflared-tunnel@${tunnel.cloudflare_id}.service`);
    if (fs.existsSync(unitPath)) {
      fs.unlinkSync(unitPath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Unit file not found.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error removing systemd unit file.', details: err.message });
  }
});

// Endpoint to activate systemd unit file for the tunnel (copy and enable)
app.post('/api/tunnels/:id/activate-systemd', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    const unitFileName = `cloudflared-tunnel@${tunnel.cloudflare_id}.service`;
    const srcPath = path.join(__dirname, unitFileName);
    const destPath = `/etc/systemd/system/${unitFileName}`;
    if (!fs.existsSync(srcPath)) {
      return res.status(404).json({ error: 'Unit file not found in backend. Please generate the unit file first.' });
    }
    try {
      fs.copyFileSync(srcPath, destPath);
    } catch (err) {
      return res.status(500).json({ error: 'Error copying unit file to /etc/systemd/system/. Root permissions are required.', details: err.message });
    }
    exec('systemctl daemon-reload', (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: 'Error executing systemctl daemon-reload', details: stderr || error.message });
      }
      exec(`systemctl enable --now cloudflared-tunnel@${tunnel.cloudflare_id}`, (error2, stdout2, stderr2) => {
        if (error2) {
          return res.status(500).json({ error: 'Error activating/starting systemd service', details: stderr2 || error2.message });
        }
        res.json({ success: true, message: 'Systemd service activated and started successfully.' });
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error activating systemd service.', details: err.message });
  }
});

// Endpoint to deactivate and remove systemd service for the tunnel
app.delete('/api/tunnels/:id/deactivate-systemd', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    const [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found.' });
    const unitFileName = `cloudflared-tunnel@${tunnel.cloudflare_id}.service`;
    const unitPath = `/etc/systemd/system/${unitFileName}`;
    exec(`systemctl disable --now cloudflared-tunnel@${tunnel.cloudflare_id}`, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: 'Error disabling/stopping systemd service', details: stderr || error.message });
      }
      if (fs.existsSync(unitPath)) {
        try {
          fs.unlinkSync(unitPath);
        } catch (err) {
          return res.status(500).json({ error: 'Error removing unit file from /etc/systemd/system/', details: err.message });
        }
      }
      exec('systemctl daemon-reload', (error2, stdout2, stderr2) => {
        if (error2) {
          return res.status(500).json({ error: 'Error executing systemctl daemon-reload', details: stderr2 || error2.message });
        }
        res.json({ success: true, message: 'Systemd service deactivated, stopped and unit file removed.' });
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error deactivating/removing systemd service.', details: err.message });
  }
});

// Endpoint to completely delete tunnel
app.delete('/api/tunnels/:id', async (req, res) => {
  const tunnelId = req.params.id;
  try {
    // Find tunnel and account - try by database ID first, then by cloudflare_id
    let [[tunnel]] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [tunnelId]);
    
    // If not found by database ID, try by cloudflare_id (for temporary tunnels)
    if (!tunnel) {
      [tunnel] = await db.query('SELECT t.*, a.name as account_name FROM tunnels t JOIN accounts a ON t.account_id = a.id WHERE t.cloudflare_id = ?', [tunnelId]);
      if (!tunnel) {
        return res.status(404).json({ error: 'Tunnel not found.' });
      }
    }

    const accountDir = path.join(process.env.HOME || process.env.USERPROFILE || '', `.cloudflared/${tunnel.account_name}`);
    const credPath = path.join(accountDir, `${tunnel.cloudflare_id}.json`);
    const configPath = path.join(accountDir, `config-${tunnel.cloudflare_id}.yml`);
    const unitFileName = `cloudflared-tunnel@${tunnel.cloudflare_id}.service`;
    const unitPath = `/etc/systemd/system/${unitFileName}`;
    const localUnitPath = path.join(__dirname, unitFileName);
    const certPath = path.join(accountDir, 'cert.pem');

    // For temporary tunnels, skip DNS cleanup and use simpler deletion
    if (tunnel.is_temporary) {
      console.log('Cleaning up temporary tunnel:', tunnel.cloudflare_id);
      
      // Stop the tunnel process
      try {
        exec(`pkill -f "cloudflared.*${tunnel.cloudflare_id}"`, (error) => {
          if (error) {
            console.log('No running tunnel process found or error stopping:', error.message);
          }
        });
      } catch (err) {
        console.log('Error stopping tunnel process:', err);
      }

      // Stop and disable systemd service if it exists
      try {
        exec(`systemctl stop cloudflared-tunnel@${tunnel.cloudflare_id}`, (error) => {
          if (error) {
            console.log('No systemd service found or error stopping:', error.message);
          }
        });
        exec(`systemctl disable cloudflared-tunnel@${tunnel.cloudflare_id}`, (error) => {
          if (error) {
            console.log('No systemd service found or error disabling:', error.message);
          }
        });
      } catch (err) {
        console.log('Error managing systemd service:', err);
      }

      // Delete the tunnel from Cloudflare
      try {
        const child = spawn('cloudflared', ['tunnel', 'delete', tunnel.cloudflare_id]);
        child.on('close', async (code) => {
          if (code !== 0) {
            console.log('Error deleting tunnel from Cloudflare, but continuing cleanup');
          }
        });
      } catch (err) {
        console.log('Error deleting tunnel from Cloudflare:', err);
      }

      // Clean up files
      try {
        // Remove config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
          console.log('Removed config file:', configPath);
        }

        // Remove credentials file
        if (fs.existsSync(credPath)) {
          fs.unlinkSync(credPath);
          console.log('Removed credentials file:', credPath);
        }

        // Remove systemd unit file from /etc/systemd/system/
        if (fs.existsSync(unitPath)) {
          fs.unlinkSync(unitPath);
          console.log('Removed systemd unit file:', unitPath);
        }

        // Remove local systemd unit file from backend directory
        if (fs.existsSync(localUnitPath)) {
          fs.unlinkSync(localUnitPath);
          console.log('Removed local systemd unit file:', localUnitPath);
        }

        // Reload systemd daemon
        exec('systemctl daemon-reload', (error) => {
          if (error) {
            console.log('Error reloading systemd daemon:', error.message);
          } else {
            console.log('Systemd daemon reloaded successfully');
          }
        });
      } catch (err) {
        console.log('Error cleaning up files:', err);
      }

      // Handle DNS record cleanup for temporary tunnels
      let dnsRecordRemoved = false;
      let dnsRecordWarning = null;
      
      try {
        // Find zone_id and api_token of the main domain corresponding to the subdomain
        const [allDomains] = await db.query('SELECT domain, zone_id, account_id FROM domains');
        let found = null;
        for (const d of allDomains) {
          if (tunnel.domain === d.domain || tunnel.domain.endsWith('.' + d.domain)) {
            if (!found || d.domain.length > found.domain.length) {
              found = d;
            }
          }
        }
        
        console.log('DEBUG: found domain for DNS cleanup:', found);
        
        if (found && found.zone_id && typeof found.zone_id === 'string' && found.zone_id.trim()) {
          const [[account]] = await db.query('SELECT api_token FROM accounts WHERE id = ?', [found.account_id]);
          if (account && account.api_token) {
            // Find the DNS record ID
            const listUrl = `https://api.cloudflare.com/client/v4/zones/${found.zone_id}/dns_records?type=CNAME&name=${encodeURIComponent(tunnel.domain)}`;
            const listResp = await fetch(listUrl, {
              headers: { 'Authorization': `Bearer ${account.api_token}`, 'Content-Type': 'application/json' }
            });
            const listData = await listResp.json();
            if (listData.success && listData.result && listData.result.length > 0) {
              const recordId = listData.result[0].id;
              // Delete the DNS record
              const delUrl = `https://api.cloudflare.com/client/v4/zones/${found.zone_id}/dns_records/${recordId}`;
              await fetch(delUrl, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${account.api_token}`, 'Content-Type': 'application/json' }
              });
              dnsRecordRemoved = true;
              console.log('DNS record removed successfully for temporary tunnel');
            } else {
              dnsRecordWarning = 'DNS record not found for automatic removal.';
              console.log('DNS record not found for temporary tunnel');
            }
          } else {
            dnsRecordWarning = 'API Token for the account is not configured. DNS record could not be removed automatically. Please add the API Token to the account or remove the DNS record manually.';
            console.log('API Token not configured for temporary tunnel DNS cleanup');
          }
        } else if (found) {
          console.log('DEBUG: found.zone_id:', found.zone_id);
          dnsRecordWarning = 'Domain Zone ID is not configured. The DNS record could not be removed automatically. Please add the Zone ID to the domain or remove the DNS record manually.';
        } else {
          dnsRecordWarning = 'Domain principal is not registered in the system. The DNS record could not be removed automatically. Please register the domain with Zone ID and API Token or remove the DNS record manually.';
        }
      } catch (err) {
        console.log('Error during DNS cleanup for temporary tunnel:', err);
        dnsRecordWarning = 'Error occurred during DNS record cleanup.';
      }

      // Remove from database
      await db.query('DELETE FROM tunnels WHERE cloudflare_id = ?', [tunnel.cloudflare_id]);
      console.log('Removed tunnel from database:', tunnel.cloudflare_id);

      res.json({ 
        success: true, 
        message: 'Temporary tunnel cleaned up successfully',
        dnsRecordRemoved,
        dnsRecordWarning
      });
      return;
    }

    // For regular tunnels, use the existing deletion logic
    // Find zone_id and api_token of the main domain corresponding to the subdomain
    const [allDomains] = await db.query('SELECT domain, zone_id, account_id FROM domains');
    let found = null;
    for (const d of allDomains) {
      if (tunnel.domain === d.domain || tunnel.domain.endsWith('.' + d.domain)) {
        if (!found || d.domain.length > found.domain.length) {
          found = d;
        }
      }
    }
    let dnsRecordRemoved = false;
    let dnsRecordWarning = null;
    console.log('DEBUG: found:', found);
    if (found && found.zone_id && typeof found.zone_id === 'string' && found.zone_id.trim()) {
      const [[account]] = await db.query('SELECT api_token FROM accounts WHERE id = ?', [found.account_id]);
      if (account && account.api_token) {
        // Find the DNS record ID
        const listUrl = `https://api.cloudflare.com/client/v4/zones/${found.zone_id}/dns_records?type=CNAME&name=${encodeURIComponent(tunnel.domain)}`;
        const listResp = await fetch(listUrl, {
          headers: { 'Authorization': `Bearer ${account.api_token}`, 'Content-Type': 'application/json' }
        });
        const listData = await listResp.json();
        if (listData.success && listData.result && listData.result.length > 0) {
          const recordId = listData.result[0].id;
          // Delete the DNS record
          const delUrl = `https://api.cloudflare.com/client/v4/zones/${found.zone_id}/dns_records/${recordId}`;
          await fetch(delUrl, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${account.api_token}`, 'Content-Type': 'application/json' }
          });
          dnsRecordRemoved = true;
        } else {
          dnsRecordWarning = 'DNS record not found for automatic removal.';
        }
      } else {
        dnsRecordWarning = 'API Token for the account is not configured. DNS record could not be removed automatically. Please add the API Token to the account or remove the DNS record manually.';
      }
    } else if (found) {
      console.log('DEBUG: found.zone_id:', found.zone_id);
      dnsRecordWarning = 'Domain Zone ID is not configured. The DNS record could not be removed automatically. Please add the Zone ID to the domain or remove the DNS record manually.';
    } else {
      dnsRecordWarning = 'Domain principal is not registered in the system. The DNS record could not be removed automatically. Please register the domain with Zone ID and API Token or remove the DNS record manually.';
    }
    console.log('DEBUG: dnsRecordWarning:', dnsRecordWarning);

    // 1. Stop/disable systemd service
    await new Promise((resolve) => {
      exec(`systemctl disable --now cloudflared-tunnel@${tunnel.cloudflare_id}`, () => resolve());
    });
    // 2. Remove systemd unit file
    if (fs.existsSync(unitPath)) {
      try { fs.unlinkSync(unitPath); } catch {}
    }
    if (fs.existsSync(localUnitPath)) {
      try { fs.unlinkSync(localUnitPath); } catch {}
    }
    // 3. Remove tunnel files
    if (fs.existsSync(credPath)) {
      try { fs.unlinkSync(credPath); } catch {}
    }
    if (fs.existsSync(configPath)) {
      try { fs.unlinkSync(configPath); } catch {}
    }
    // 4. Delete from Cloudflare
    await new Promise((resolve, reject) => {
      const child = exec(
        `cloudflared tunnel delete -f ${tunnel.cloudflare_id}`,
        { env: { ...process.env, TUNNEL_ORIGIN_CERT: certPath } },
        (error, stdout, stderr) => {
          console.log('[cloudflared tunnel delete] stdout:', stdout);
          console.log('[cloudflared tunnel delete] stderr:', stderr);
          if (error) {
            console.error('[cloudflared tunnel delete] error:', error);
            return reject(new Error(`Error deleting Cloudflare tunnel: ${stderr || error.message}`));
          }
          resolve();
        }
      );
    });
    // 5. Remove from database
    await db.query('DELETE FROM tunnels WHERE id = ?', [tunnelId]);
    // 6. systemctl daemon-reload
    await new Promise((resolve) => {
      exec('systemctl daemon-reload', () => resolve());
    });
    res.json({ success: true, dnsRecordRemoved, dnsRecordWarning });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting tunnel.', details: err.message });
  }
});


// Validation endpoints
app.post('/api/validate/api-token', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ valid: false, error: 'API token is required' });
  }
  
  // Basic format validation
  const basicValidation = validateApiToken(token);
  if (!basicValidation.valid) {
    return res.json({ valid: false, error: basicValidation.error });
  }
  
  // Optional: Validate with Cloudflare API
  if (process.env.VALIDATE_API_TOKEN === 'true') {
    const cloudflareValidation = await validateApiTokenWithCloudflare(token);
    return res.json(cloudflareValidation);
  }
  
  res.json({ valid: true });
});

app.post('/api/validate/zone-id', async (req, res) => {
  const { zoneId, apiToken } = req.body;
  
  if (!zoneId) {
    return res.status(400).json({ valid: false, error: 'Zone ID is required' });
  }
  
  // Basic format validation
  const basicValidation = validateZoneId(zoneId);
  if (!basicValidation.valid) {
    return res.json({ valid: false, error: basicValidation.error });
  }
  
  // Optional: Validate with Cloudflare API if API token provided
  if (apiToken && process.env.VALIDATE_ZONE_ID === 'true') {
    const cloudflareValidation = await validateZoneIdWithCloudflare(zoneId, apiToken);
    return res.json(cloudflareValidation);
  }
  
  res.json({ valid: true });
});

// Graceful shutdown: stop all running tunnels (systemd) and kill temporary cloudflared processes
let isShuttingDown = false;
async function shutdownTunnelsAndExit(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    console.log(`\nReceived ${signal}. Stopping tunnels before exit...`);
    // Fetch all tunnels; prioritize stopping ones marked running
    const [rows] = await db.query('SELECT id, cloudflare_id, is_temporary, status FROM tunnels');
    const stopPromises = [];

    for (const row of rows) {
      const cloudflareId = row.cloudflare_id;
      // Stop systemd-managed tunnel units (safe to call even if not enabled)
      stopPromises.push(new Promise((resolve) => {
        exec(`systemctl stop cloudflared-tunnel@${cloudflareId}`, () => resolve());
      }));

      // If temporary, also try to kill any direct cloudflared processes
      if (row.is_temporary) {
        stopPromises.push(new Promise((resolve) => {
          exec(`pkill -f "cloudflared.*${cloudflareId}"`, () => resolve());
        }));
      }
    }

    await Promise.allSettled(stopPromises);
    console.log('All tunnel stop requests issued. Exiting.');
  } catch (err) {
    console.error('Error during shutdown cleanup:', err);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdownTunnelsAndExit('SIGINT'));
process.on('SIGTERM', () => shutdownTunnelsAndExit('SIGTERM'));
process.on('beforeExit', () => shutdownTunnelsAndExit('beforeExit'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
