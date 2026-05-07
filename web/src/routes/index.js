const os = require("os");
const express = require("express");
const router = express.Router();
const { redisClient, redisSlaveClient } = require("../config/redis");

router.get("/", async (req, res) => {
  const hostname = os.hostname();
  const sid = req.sessionID;
  const sessionKey = `session:${sid}`;

  try {
    // 1. 取得 Master 與 Slave 的即時資料對照
    const [remainingTTL, masterRaw, slaveRaw, masterInfo, slaveInfo] =
      await Promise.all([
        redisClient.ttl(sessionKey),
        redisClient.get(sessionKey),
        redisSlaveClient.get(sessionKey),
        redisClient.info("replication"), // 只抓取 replication 相關資訊
        redisSlaveClient.info("replication"),
      ]);

    const masterData = masterRaw ? JSON.parse(masterRaw) : null;
    const slaveData = slaveRaw ? JSON.parse(slaveRaw) : null;

    // 2. 取得連線實體資訊 (現在程式連到哪裡？)
    const masterConn = {
      host: redisClient.stream.remoteAddress,
      port: redisClient.stream.remotePort,
      status: redisClient.status,
    };
    const slaveConn = {
      host: redisSlaveClient.stream.remoteAddress,
      port: redisSlaveClient.stream.remotePort,
      status: redisSlaveClient.status,
    };

    // 3. 渲染頁面
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-Hant">
    <head>
        <meta charset="UTF-8">
        <title>Redis HA 觀測站</title>
        <style>
            body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #eceff1; }
            .container { max-width: 1000px; margin: auto; background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .card { border: 1px solid #ddd; padding: 15px; border-radius: 6px; }
            .master-card { border-left: 5px solid #2ecc71; }
            .slave-card { border-left: 5px solid #3498db; }
            .tag { font-size: 0.8em; padding: 2px 8px; border-radius: 10px; color: white; font-weight: bold; }
            .tag-green { background: #2ecc71; }
            .tag-blue { background: #3498db; }
            pre { background: #272822; color: #f8f8f2; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
            .metric { font-size: 1.2em; font-weight: bold; color: #d35400; }
            .conn-info { font-size: 0.85em; color: #666; margin-top: 5px; }
            textarea { width: 100%; height: 60px; margin: 10px 0; box-sizing: border-box; }
            button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; cursor: pointer; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Redis High Availability Dashboard</h2>
            
            <div class="info">
                <p><strong>Session ID:</strong> <code>${sid}</code> <span class="tag tag-green">TTL: ${remainingTTL}s</span></p>
            </div>
            <div class="info">
                <p><strong>Hostname:</strong> <code>${hostname}</code></p>
            </div>

            <div class="status-grid">
                <!-- Master 視角 -->
                <div class="card master-card">
                    <h3>Master Node <span class="tag tag-green">Active</span></h3>
                    <div class="conn-info">Connected to: ${masterConn.host}:${masterConn.port} (${masterConn.status})</div>
                    <hr>
                    <p><strong>Data:</strong> <span class="metric">${masterData ? masterData.data : "N/A"}</span></p>
                    <p><strong>Init Time:</strong> ${masterData ? masterData.initTime : "N/A"}</p>
                    <strong>Replication Info:</strong>
                    <pre>${masterInfo}</pre>
                </div>

                <!-- Slave 視角 -->
                <div class="card slave-card">
                    <h3>Slave Node <span class="tag tag-blue">Read-Only</span></h3>
                    <div class="conn-info">Connected to: ${slaveConn.host}:${slaveConn.port} (${slaveConn.status})</div>
                    <hr>
                    <p><strong>Data:</strong> <span class="metric">${slaveData ? slaveData.data : "N/A"}</span></p>
                    <p><strong>Replication Lag:</strong> ${masterData?.data === slaveData?.data ? "✅ Synced" : "❌ Lagging"}</p>
                    <strong>Replication Info:</strong>
                    <pre>${slaveInfo}</pre>
                </div>
            </div>

            <div class="card">
                <h3>更新資料 (Write to Master)</h3>
                <textarea id="dialogContent" placeholder="輸入內容後觀察 Slave 是否同步..."></textarea>
                <button id="saveBtn">更新並重新整理</button>
            </div>
            
            <p style="text-align: center; color: #7f8c8d; font-size: 0.8em;">提示：手動停止 Master 容器，觀察 Dashboard 是否自動漂移至新 Master</p>
        </div>

        <script>
            document.getElementById('saveBtn').addEventListener('click', async () => {
                const content = document.getElementById('dialogContent').value;
                try {
                    const response = await fetch('/save-dialog', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content })
                    });
                    if (response.ok) location.reload();
                } catch (err) { alert('連線錯誤'); }
            });
        </script>
    </body>
    </html>
    `);
  } catch (err) {
    res.status(500).send("Dashboard Error: " + err.message);
  }
});

router.post("/save-dialog", async (req, res) => {
  try {
    const { content } = req.body; // 取得前端傳來的對話框內容
    const sid = req.sessionID;

    // 1. 先讀取現有的 Session 資料（或初始化）
    const rawData = await redisClient.get(`session:${sid}`);
    let sessionData = rawData ? JSON.parse(rawData) : { initTime: new Date() };

    // 2. 更新資料結構：{ initTime: ..., data: ... }
    sessionData.data = content;
    // 如果沒有 initTime 則補上
    if (!sessionData.initTime) sessionData.initTime = new Date();

    // 3. 寫回 Redis Master (並設定過期時間，例如 1 小時)
    await redisClient.set(
      `session:${sid}`,
      JSON.stringify(sessionData),
      "EX",
      3600,
    );

    res.json({ success: true, message: "儲存成功" });
  } catch (error) {
    console.error("Save Redis Error:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
});

module.exports = router;
