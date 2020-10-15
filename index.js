const fetch = require("node-fetch");
const fastify = require("fastify")({ logger: true });

const {
	hlsServers,
	renewCookie,
	escapeRegExp,
	getTrial,
	getTrialSession,
	getSession,
	getCategory,
	getChannels,
	getSecrets,
	generateChannelsPlaylist,
	generateCategoriesPlaylist,
	getStream,
} = require("./tenet");

let cookieObj = {
	cookie: undefined,
	expiresAfter: undefined,
};

let data = { categories: [], channels: [], secrets: {} };

fastify.head("*", (_, res) => {
	res.code(200)
	   .header("Access-Control-Allow-Origin", "*")
	   .send();
});

fastify.get("/c", async (_, res) => {
	r = await renewCookie(cookieObj, data);
	cookieObj = r.cookieObj;
	data = r.data;

	res
		.code(200)
		.header("Content-Type", "application/x-mpegurl; charset=utf-8")
		.send(generateCategoriesPlaylist(data.categories));
});

fastify.get("/c/:id", async (req, res) => {
	r = await renewCookie(cookieObj, data);
	cookieObj = r.cookieObj;
	data = r.data;

	res
		.code(200)
		.header("Content-Type", "application/x-mpegurl; charset=utf-8")
		.send(
			generateChannelsPlaylist(
				data.channels.filter((c) => c.category.includes(req.params.id))
			)
		);
});

fastify.get("/p/:number/info", async (req, _) => {
	r = await renewCookie(cookieObj, data);
	cookieObj = r.cookieObj;
	data = r.data;
	const channel = data.channels.find(
		(c) => c.number === parseInt(req.params.number)
	);
	return channel;
});

fastify.get("/p/:number", async (req, res) => {
	r = await renewCookie(cookieObj, data);
	cookieObj = r.cookieObj;
	data = r.data;

	console.log("request start");

	const { streamUrl, channel } = await getStreamUrl(parseInt(req.params.number));

	const m3uRes = await fetch(streamUrl, { cache: "no-store" });

	const m3u = (await m3uRes.text())

	const am3u = m3u.replace(
		new RegExp(escapeRegExp(channel.ip), "g"),
		`https://${hlsServers[3]}:8812/hls_get/$&`
	);

	console.log(channel, am3u);

	res
		.code(200)
		.header("Content-Type", "application/vnd.apple.mpegurl")
		.header("Cache-Control", "no-cache")
		.header("Date", m3uRes.headers.get("Date"))
		.header("Expires", m3uRes.headers.get("Expires"))
		.send(am3u);
});

fastify.get("/p/:number/url", async (req, res) => {
	r = await renewCookie(cookieObj, data);
	cookieObj = r.cookieObj;
	data = r.data;

	const { streamUrl } = await getStreamUrl(parseInt(req.params.number));

	return streamUrl;
});

async function getStreamUrl(number) {
	const channel = data.channels.find(
		(c) => c.number === number
	);
	
	if (!data.secrets[channel.ip] || data.secrets[channel.ip].expiresMs <= Date.now()) {
		data.secrets[channel.ip] = await getSecrets(cookieObj.cookie, channel.ip);
	}
	const secrets = data.secrets[channel.ip];

	const streamUrl = getStream(secrets, channel.ip);

	return { streamUrl, channel };
}

async function main() {
	await fastify.listen(3000, "0.0.0.0");
}

main();
