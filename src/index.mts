import express from "express";
import cors from "cors";
import https from "https";
import fs from "fs";
import path from "path";
import { queryGameServerInfo, queryGameServerPlayer } from "steam-server-query";
import { config } from "dotenv";

const env = config();

if (env.error) throw env.error;
if (env.parsed === undefined) throw new Error("No env file");
["PORT", "QUERY_HOST", "QUERY_PORT", "CERT_DIR"].forEach(k => {
    if (env.parsed![k] === undefined) throw new Error("Env must contain " + k);
});

const key = fs.readFileSync(path.resolve(env.parsed["CERT_DIR"] + "/hawktuah.key"));
const cert = fs.readFileSync(env.parsed["CERT_DIR"] + "/hawktuah.crt");

const port = env.parsed["PORT"];
const query_host = env.parsed["QUERY_HOST"];
const query_port = env.parsed["QUERY_PORT"];

const app = express();
app.use(express.json());

app.get("/status", cors(), async (req, res) => {
    try {
        const server_info = await queryGameServerInfo(`${query_host}:${query_port}`);
        const server_players = await queryGameServerPlayer(`${query_host}:${query_port}`);
        res.send({ info: server_info, players: server_players });
    } catch (err: any) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

const https_server = https.createServer({ key: key, cert: cert }, app);

https_server.listen(port, () => {
    console.log(`Listening on ${port}`);
});
