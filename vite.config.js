import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import url from 'url';
import fs from 'fs';
import path from 'path';

let commitSha = 'dev';
try {
  commitSha = (process.env.VERCEL_GIT_COMMIT_SHA || execSync('git rev-parse --short HEAD').toString()).slice(0, 7);
} catch {}

function devApiPlugin() {
  return {
    name: 'dev-api-plugin',
    configureServer(server) {
      // Load .env.local into process.env if present
      const envPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [k, ...v] = trimmed.split('=');
            if (k && !process.env[k.trim()]) {
              process.env[k.trim()] = v.join('=').trim();
            }
          }
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = url.parse(req.url, true);
        if (parsedUrl.pathname && parsedUrl.pathname.startsWith('/api/')) {
          const endpoint = parsedUrl.pathname.replace('/api/', '').split('?')[0];
          const filePath = path.resolve(process.cwd(), 'api', `${endpoint}.js`);

          if (fs.existsSync(filePath)) {
            try {
              // Parse body for POST requests
              if (req.method === 'POST') {
                const chunks = [];
                for await (const chunk of req) {
                  chunks.push(chunk);
                }
                const bodyStr = Buffer.concat(chunks).toString('utf8');
                try {
                  req.body = bodyStr ? JSON.parse(bodyStr) : {};
                } catch {
                  req.body = bodyStr;
                }
              }

              req.query = parsedUrl.query || {};

              // Mock Vercel serverless response methods
              res.status = (code) => {
                res.statusCode = code;
                return res;
              };
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return res;
              };

              const mod = await import(`file://${filePath}?t=${Date.now()}`);
              if (typeof mod.default === 'function') {
                await mod.default(req, res);
                return;
              }
            } catch (err) {
              console.error(`[Dev API Error] ${parsedUrl.pathname}:`, err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
              return;
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  define: {
    __COMMIT_SHA__: JSON.stringify(commitSha),
  },
});
