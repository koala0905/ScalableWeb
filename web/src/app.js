const express = require("express");
const os = require("os");
const app = express();

app.get("/", (req, res) => {
  res.json({
    message: `Hello from ${process.env.APP_NAME || "Node"}`,
    hostname: os.hostname(),
    platform: os.platform(),
    timestamp: new Date().toISOString(),
    via_nginx: req.headers["x-forwarded-for"] || "direct access",
  });
});

app.listen(3000, () => console.log("Server is running on port 3000"));
