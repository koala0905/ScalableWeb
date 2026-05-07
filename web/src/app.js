const express = require("express");
const session = require("express-session");
const { RedisStore } = require("connect-redis");
const { redisClient } = require("./config/redis");
const sessionMiddleware = require("./middleware/session");
const routes = require("./routes");

const app = express();

app.use(express.json());
app.use(
  session({
    name: "_sid",
    store: new RedisStore({
      prefix: "session:",
      client: redisClient,
      disableTouch: false,
      disableTTL: true,
    }),
    secret: process.env.SESSION_SECRET || "gfox:ym1Or!}(Otc",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 3600000,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" ? true : false,
    },
  }),
);

console.log(
  "Session middleware configured with secret:",
  process.env.SESSION_SECRET,
);
// 掛載路由
app.use("/", sessionMiddleware, routes);

module.exports = app;
