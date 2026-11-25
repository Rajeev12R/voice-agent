import "dotenv/config";
import express from "express";
import conversationRoutes from "./routes/conversationRoutes.js";
import crmRoutes from "./routes/crmRoutes.js";

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use("/api/conversation", conversationRoutes);
app.use("/api/crm", crmRoutes);

app.get('/', (req, res) => {
  console.log("Backend Running.");
  res.send("Backend Running.");
});


app.listen(port, () => {
    console.log(`Server Started at port: http://localhost:${port}`);

})