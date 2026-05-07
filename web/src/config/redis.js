const Redis = require("ioredis");

// const redisMaster = new Redis({
//   host: process.env.REDIS_MASTER_HOST || "redis-master",
//   port: process.env.REDIS_MASTER_PORT || 6379,
// });
// const redisSlave = new Redis({
//   host: process.env.REDIS_SLAVE_HOST || "redis-slave",
//   port: process.env.REDIS_SLAVE_PORT || 6379,
// });

const redisClient = new Redis({
  sentinels: [
    //connect to 10.2.1.20
    { host: "10.2.1.20", port: 26379 },
    { host: "10.2.1.21", port: 26379 },
    { host: "10.2.1.22", port: 26379 },
  ],
  name: "myRedis", // 必須對齊你在 sentinel.conf 裡定義的 master-name

  // 建立連線時的專業建議設定
  role: "master", // 確保 session 寫入一定是在 master
  sentinelRetryStrategy: (times) => Math.min(times * 100, 2000),
  maxRetriesPerRequest: null,
  reconnectOnError: (err) => {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      return true; // 當遇到 READONLY 錯誤（代表連到了舊王），強制重連
    }
  },
});

const redisSlaveClient = new Redis({
  sentinels: [
    { host: "10.2.1.20", port: 26379 },
    { host: "10.2.1.21", port: 26379 },
    { host: "10.2.1.22", port: 26379 },
  ],
  name: "myRedis",
  role: "slave", // 強制唯讀連線
});

module.exports = { redisClient, redisSlaveClient };
