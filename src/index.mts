import cors from "cors";
import { config } from "dotenv";
import express from "express";
import fs from "fs";
import http from "http";
import https from "https";
import path, { resolve } from "path";
import { queryGameServerInfo, queryGameServerPlayer } from "steam-server-query";
import xml2js from "xml2js";

const env = config();

if (env.error) throw env.error;
if (env.parsed === undefined) throw new Error("No env file");
["PORT", "QUERY_HOST", "QUERY_PORT", "CERT_DIR", "WOW_SOAP_USER", "WOW_SOAP_PASS"].forEach(k => {
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
app.use(cors({
    credentials: true,
    preflightContinue: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: true
}));

const game_handlers: Record<string, { info: () => Promise<any>, players: () => Promise<any>; }> = {
    starbound: {
        info: async () => await queryGameServerInfo(`${query_host}:${query_port}`),
        players: async () => await queryGameServerPlayer(`${query_host}:${query_port}`)
    },
};

app.get("/status", async (req, res) => {
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
                info: await game_handlers[game].info(),
                players: await game_handlers[game].players()
            });
        }
    } catch (err: any) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

const do_wow_soap = (command: string): Promise<{ result?: string; fault_code?: string, fault_string?: string; }> => {
    return new Promise((resolve, reject) => {
        const req = http.request({
            port: 7878,
            method: "POST",
            hostname: "127.0.0.1",
            auth: `${env.parsed!["WOW_SOAP_USER"]}:${env.parsed!["WOW_SOAP_PASS"]}`,
            headers: { 'Content-Type': 'application/xml' }
        }, res => {
            res.on('data', async d => {
                const xml = await xml2js.parseStringPromise(d.toString());

                const body = xml["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0];
                const fault = body["SOAP-ENV:Fault"];
                if (fault) {
                    return resolve({
                        fault_code: fault[0]["faultcode"][0],
                        fault_string: fault[0]["faultstring"][0],
                    });

                }
                const response = body["ns1:executeCommandResponse"];
                if (response) {
                    return resolve({
                        result: response[0]["result"][0]
                    });
                }
                console.log(d.toString());
            });
        });
        req.write(
            '<SOAP-ENV:Envelope' +
            ' xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"' +
            ' xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"' +
            ' xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance"' +
            ' xmlns:xsd="http://www.w3.org/1999/XMLSchema"' +
            ' xmlns:ns1="urn:AC">' +
            '<SOAP-ENV:Body>' +
            '<ns1:executeCommand>' +
            '<command>' + command + '</command>' +
            '</ns1:executeCommand>' +
            '</SOAP-ENV:Body>' +
            '</SOAP-ENV:Envelope>'
        );
        req.end();
    });
};

app.post("/create_wow_account", async (req, res) => {
    try {
        const { user, pass } = req.body as { user: string, pass: string; };
        if (user.length > 16 || pass.length > 16) {
            res.status(400).send("USER_PASS_LEN_ERR");
            return;
        }
        const format = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/;
        if (format.test(user)) {
            res.status(400).send("USER_SPEC_CHAR_ERR");
            return;
        }
        const soap_res = await do_wow_soap(`account create ${user} ${pass}`);
        if (soap_res["fault_code"] !== undefined) {
            console.log("Create account error", soap_res["fault_code"], soap_res["fault_string"]);
            res.status(500).send(soap_res["fault_string"]);
            return;
        }
        res.send(soap_res["result"]);
    } catch (err: any) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
});

const https_server = https.createServer(creds, app);

https_server.listen(port, () => {
    console.log(`Listening on ${port}`);
});
