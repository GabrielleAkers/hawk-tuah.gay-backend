import express from "express";
import { queryGameServerInfo, queryGameServerPlayer } from "steam-server-query";
import { config } from "dotenv";

const env = config();

if (env.error) throw env.error;
if (env.parsed === undefined) throw new Error("No env file");
["PORT", "QUERY_HOST", "QUERY_PORT"].forEach(k => {
    if (env.parsed![k] === undefined) throw new Error("Env must contain " + k);
});

const port = env.parsed["PORT"];
const query_host = env.parsed["QUERY_HOST"];
const query_port = env.parsed["QUERY_PORT"];

const app = express();
app.use(express.json());

app.get("/status", async (req, res) => {
    try {
        const server_info = await queryGameServerInfo(`${query_host}:${query_port}`);
        const server_players = await queryGameServerPlayer(`${query_host}:${query_port}`);
        res.send({ info: server_info, players: server_players });
    } catch (err: any) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

app.listen(port, () => {
    console.log(`Listening on ${port}`);
});
