// VPS-1 - the APP box (Teezer, 77.237.242.249). Serves the website/admin/API to users and runs PostgreSQL + Redis.
// It runs NO heavy queue worker: all background jobs are handled by VPS-2 so the
// website stays fast. (See ecosystem.worker.config.js for the worker box.)
//
// Start on VPS-1 with:  pm2 start deploy/pm2/ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: "teezer-web",
      cwd: "/var/www/teezer/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        NEXT_PUBLIC_API_URL: "https://api.teezer.live/api/v1",
        NEXT_PUBLIC_APP_URL: "https://teezer.live",
      },
    },
    {
      name: "teezer-admin",
      cwd: "/var/www/teezer/admin",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3001",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        NEXT_PUBLIC_API_URL: "https://api.teezer.live/api/v1",
        NEXT_PUBLIC_ADMIN_URL: "https://backend.teezer.live",
      },
    },
    // Optional: if you ever want light jobs to run on VPS-1 too (lower latency for
    // notifications / score updates), uncomment this. Heavy queues stay on VPS-2.
    // {
    //   name: "teezer-queue-light",
    //   cwd: "/var/www/teezer/server",
    //   script: "artisan",
    //   interpreter: "php",
    //   args: "queue:work --queue=notifications,default --sleep=3 --tries=3 --timeout=60",
    //   exec_mode: "fork",
    //   instances: 1,
    //   env: { APP_ENV: "production" },
    // },
  ],
};
