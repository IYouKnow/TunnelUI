// Função para gerar o conteúdo do unit file systemd para cloudflared tunnel
export function generateCloudflaredUnit({ tunnelId, user, configPath }) {
  return `[Unit]\nDescription=Cloudflared Tunnel %i\nAfter=network.target\n\n[Service]\nType=simple\nUser=${user}\nExecStart=/usr/bin/env cloudflared tunnel --config ${configPath} run\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\n`;
} 