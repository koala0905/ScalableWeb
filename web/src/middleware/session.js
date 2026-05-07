const { redisClient } = require("../config/redis");

module.exports = async (req, res, next) => {
  if (!req.session) {
    console.error(
      "[Session Error] express-session 尚未初始化或 Store 連線中斷",
    );
    return res
      .status(500)
      .json({ success: false, message: "Session 系統異常" });
  }

  const sid = req.sessionID;
  const sessionKey = `session:${sid}`;

  try {
    // 1. 檢查 Redis 連線狀態 (ioredis 特有屬性)
    if (redisClient.status !== "ready") {
      throw new Error(`Redis 狀態異常: ${redisClient.status}`);
    }

    // 2. 讀取資料
    const rawData = await redisClient.get(sessionKey);

    if (rawData) {
      // 【邏輯：有效 Session】
      try {
        const parsedData = JSON.parse(rawData);

        // 延長壽命 (原子性操作建議)
        await redisClient.expire(sessionKey, 3600);

        req.sessionData = parsedData;
        console.log(`[Session] Valid & Touched: ${sid}`);
      } catch (parseError) {
        // 防止 Redis 內存到的不是合法的 JSON
        console.error("[Session Error] JSON 解析失敗:", parseError);
        req.sessionData = null;
      }
    } else {
      // 【邏輯：無效或新 Session】
      const initialData = {
        initTime: new Date().toISOString(),
        data: "new_session",
      };

      // 使用原子操作確保寫入
      await redisClient.set(
        sessionKey,
        JSON.stringify(initialData),
        "EX",
        3600,
      );

      // 強制觸發 express-session 的 Set-Cookie
      // 這裡要小心，如果 req.session 是 undefined，這行會噴錯
      req.session.isNew = true;

      req.sessionData = initialData;
      console.log(`[Session] New session created: ${sid}`);
    }

    next();
  } catch (error) {
    // 4. 集中錯誤處理
    console.error(`[Session Critical Error] SID: ${sid}`, error.message);
    return res.status(503).json({
      success: false,
      message: "連線忙碌中，請稍後再試",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
