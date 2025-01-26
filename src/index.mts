import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import https from "https";
import { queryGameServerInfo, queryGameServerPlayer } from "steam-server-query";
import { config } from "dotenv";

const env = config();

if (env.error) throw env.error;
if (env.parsed === undefined) throw new Error("No env file");
["PORT", "QUERY_HOST", "QUERY_PORT", "CERT_DIR"].forEach(k => {
    if (env.parsed![k] === undefined) throw new Error("Env must contain " + k);
});

const port = env.parsed["PORT"];
const query_host = env.parsed["QUERY_HOST"];
const query_port = env.parsed["QUERY_PORT"];

const creds = {
    key: fs.readFileSync(path.resolve(env.parsed["CERT_DIR"] + "/privkey.pem")),
    cert: fs.readFileSync(path.resolve(env.parsed["CERT_DIR"] + "/cert.pem")),
};

const app = express();
app.use(express.json());

const game_handlers: Record<string, { info: () => Promise<any>, players: () => Promise<any>; }> = {
    starbound: {
        info: async () => await queryGameServerInfo(`${query_host}:${query_port}`),
        players: async () => await queryGameServerPlayer(`${query_host}:${query_port}`)
    },
};

app.get("/status", cors(), async (req, res) => {
    try {
        const game = req.query.game?.toString().toLowerCase() || "all";
        if (game === "all") {
            const o: Record<string, { info: Record<string, any>, players: Record<string, any>; }> = {};
            Object.entries(game_handlers).forEach(async (kv) => {
                o[kv[0]] = {
                    info: await kv[1].info(),
                    players: await kv[1].players()
                };
            });
            res.send(o);
        } else if (!Object.keys(game_handlers).includes(game)) {
            res.status(400).send("Game not supported");
        } else {
            res.send({
                [game]: {
                    info: await game_handlers[game].info(),
                    players: await game_handlers[game].players()
                }
            });
        }
    } catch (err: any) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

const https_server = https.createServer(creds, app);

https_server.listen(port, () => {
    console.log(`Listening on ${port}`);
});
