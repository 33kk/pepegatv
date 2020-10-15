const fetch = require("node-fetch");

const hlsServers = [
	"vtv9.tenet.ua",
	"vtv8.tenet.ua",
	"vtv6.tenet.ua",
	"vtv5.tenet.ua",
	"vtv4.tenet.ua",
	"vtv2.tenet.ua",
	"vtv2.tenet.ua",
];

async function renewCookie(cookieObj, data) {
	if (
		new Date() > cookieObj.expiresAfter ||
		!cookieObj.expiresAfter ||
		!cookieObj.cookie
	) {
		cookieObj.cookie = await getTrialSession();
		cookieObj.expiresAfter = new Date(+new Date() + 20 * 60000);
		data = await getChannels(cookieObj.cookie);
		data.secrets = {};
	}
	return { cookieObj, data };
}

function escapeRegExp(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getTrialSession() {
	const cookie = await getSession();
	await getTrial(cookie);
	return cookie;
}

async function getTrial(cookie) {
	const res = await fetch(
		"https://tenet.tv/index.php?action=tryfree&startp=2_0&timezone=UTC&ofset=0",
		{
			headers: {
				Cookie: cookie,
			},
		}
	);
	const data = { cookie, page: await res.text() };
	return data;
}

async function getSession() {
	const res = await fetch("http://tenet.tv");
	return res.headers.get("set-cookie").split(";")[0];
}

function getCategory(categories, channelId) {
	let ids = ["a"];
	for (const category of categories) {
		if (category.array && category.array.includes(channelId)) {
			ids.push(category.id);
		}
	}
	return ids.length > 0 ? ids : undefined;
}

async function getChannels(cookie) {
	const res = await fetch(
		"https://tenet.tv/iptv/all11/ajax.php?agent=comp&serialnum=0&macaddr=nullpacked&page=getallinstart&devver=1&devtype=json&tryfree=1&proshivka=tv.tenet.ua&softver=&originsoftver=&ipadress=1.2.3.4&settings=1&stbtype=comp&ismobile=0",
		{
			headers: {
				Cookie: cookie,
			},
			referrer: "http://tenet.tv/portal",
		}
	);
	const json = await res.json();
	const iptvlist = json.iptvlist[0];
	const loadmainmenu = json.loadmainmenu[0][2];

	const categories = loadmainmenu
		.map((e) => {
			const d = e.split("::");
			return {
				id: d[0],
				name: d[1],
				array: ["a", "t", "f"].includes(d[0])
					? undefined
					: iptvlist["category" + d[0]],
			};
		})
		.filter((c) => c.id !== "f" && c.id !== "t");

	let channels = [];
	for (let i = 0; i < iptvlist.chnames.length; i++) {
		const name = iptvlist.chnames[i];
		if (name === "TENET") continue;

		const number = parseInt(iptvlist.chnums[i]);
		const category = getCategory(categories, iptvlist.category0[i]);
		const program = iptvlist.chprogs[i].trim() || undefined;

		const weirdComressionThing = parseInt(iptvlist.trstandart[i]);
		let compression = 1;
		switch (weirdComressionThing) {
			case 1:
				compression = 0;
				break;
			case 2:
				compression = 1;
				break;
			case 3:
				compression = 2;
				break;
		}

		const ip = iptvlist.chips[i];
		const pIp = ip.split(":")[0];
		const sIp = pIp.split(".");
		let ipPart = 0;
		switch (compression) {
			case 0:
				ipPart = sIp[1];
				break;
			case 1:
				ipPart = parseInt(sIp[1]) + 32;
				break;
			case 2:
				ipPart = parseInt(sIp[1]) + 16;
				break;
		}
		const nIp = `${sIp[0]}.${ipPart}.${sIp[2]}.${sIp[3]}`;

		channels.push({ name, ip: nIp, number, category, program });
	}

	channels = channels.sort((a, b) => a.number - b.number);

	return { channels, categories };
}

function randomItem(items) {
	return items[Math.floor(Math.random() * items.length)];
}

async function getSecrets(cookie, ip) {
	console.log("Get secrets", ip);
	const res = await fetch(
		`https://tenet.tv/iptv/all11/ajax.php?agent=comp&serialnum=0&macaddr=nullpacked&page=gettemptvlink&newchip=${ip}&chid=272&lasttvcatid=2&newlink=1&proshivka=tv.tenet.ua&softver=&originsoftver=&ipadress=1.2.3.4&settings=1&stbtype=comp&ismobile=0`,
		{
			headers: {
				Cookie: cookie,
			},
			referrer: "http://tenet.tv/portal/",
		}
	);
	const str = await res.text();
	const regex = /<input type='hidden' value="(?<hls>.*?)" id='hiddenhlsurl'>|<input type='hidden' value="(?<exp>.*?)" id='hiddenexpires'>/gm;
	let hls = "";
	let exp = "";
	let m;

	while ((m = regex.exec(str)) !== null) {
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		if (m.groups && m.groups.hls) {
			hls = m.groups.hls;
		}
		if (m.groups && m.groups.exp) {
			exp = m.groups.exp;
		}
	}
	return { hlsUrl: hls, expires: exp, expiresMs: parseInt(exp) * 1000 };
}

function generateCategoriesPlaylist(categories) {
	return [
		'#EXTM3U',
		...categories.map(
			(c) => `#EXTINF:-1,${c.name}
http://localhost:3000/c/${c.id}`
		),
	].join("\n");
}

function generateChannelsPlaylist(channels) {
	return [
		'#EXTM3U',
		...channels.map(
			(c) => `#EXTINF:-1,${c.name}
http://localhost:3000/p/${c.number}`
		),
	].join("\n");
}

function getStream(secrets, ip) {
	const hlsServer = randomItem(hlsServers);

	return `https://${hlsServer}:8812/hls_get/${ip}-.m3u8?md5=${secrets.hlsUrl}&expires=${secrets.expires}`;
}

module.exports = {
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
	getStream
}
