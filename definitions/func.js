MAIN.sockets = {};

function makemodel(item) {
	return { url: item.url, token: item.token, error: item.error };
}

function connect(item, callback) {

	if (item.socket) {
		item.socket.close();
		item.socket = null;
	}

	WEBSOCKETCLIENT(function(client) {

		item.restart = false;
		client.options.reconnectserver = true;

		if (item.token)
			client.headers['x-token'] = item.token;

		client.on('open', function() {
			MAIN.sockets[item.id] = client;
			item.socket = client;
			item.error = 0;
			item.init = true;
			client.subscribers = {};
			client.tmsready = true;
			client.model = makemodel(item);
			AUDIT(client, 'open');
		});

		client.synchronize = function() {

			client.synchronized = true;

			var publishers = {};

			for (var key in TMS.instance.meta.flow) {
				var instance = TMS.instance.meta.flow[key];
				var com = TMS.instance.meta.components[instance.component];
				if (com.itemid === item.id && com.outputs && com.outputs.length) {
					if (Object.keys(instance.connections).length)
						publishers[com.schema.id] = 1;
				}
			}

			client.send({ type: 'subscribers', subscribers: Object.keys(publishers) });
		};

		client.on('close', function(code) {

			if (code === 4001)
				client.destroy();

			item.error = code;
			client.model = makemodel(item);
			AUDIT(client, 'close');

			delete item.socket;
			delete MAIN.sockets[item.id];
			client.tmsready = false;
		});

		client.on('message', function(msg) {

			switch (msg.type) {
				case 'meta':

					item.meta = msg;

					var checksum = HASH(JSON.stringify(msg)) + '';
					client.subscribers = {};
					client.publishers = {};

					for (var i = 0; i < msg.publish.length; i++) {
						var pub = msg.publish[i];
						client.publishers[pub.id] = pub.schema;
					}

					for (var i = 0; i < msg.subscribe.length; i++) {
						var sub = msg.subscribe[i];
						client.subscribers[sub.id] = 1;
					}

					if (item.checksum !== checksum) {
						item.init = false;
						item.checksum = checksum;
						FUNC.refresh2();
					}

					if (TMS.ready)
						client.synchronize();

					break;

				case 'subscribers':
					client.subscribers = {};
					if (msg.subscribers instanceof Array) {
						for (var i = 0; i < msg.subscribers.length; i++) {
							var key = msg.subscribers[i];
							client.subscribers[key] = 1;
						}
					}
					break;

				case 'publish':
					var schema = client.publishers[msg.id];
					if (schema) {
						// HACK: very fast validation
						var err = new ErrorBuilder();
						var data = framework_jsonschema.transform(schema, err, msg.data, true);
						console.log(schema);
						if (data) {
							var id = 'pub' + item.id + 'X' + msg.id;
							for (var key in TMS.instance.meta.flow) {
								var flow = TMS.instance.meta.flow[key];
								if (flow.component === id)
									flow.process(data, client);
							}
						}
					}
					break;
			}

		});

		client.connect(item.url.replace(/^http/g, 'ws'));
		callback && setImmediate(callback);
	});
}

const TEMPLATE_PUBLISH = `<script total>

	exports.name = '{0}';
	exports.icon = '{3}';
	exports.config = {};
	exports.outputs = [{ id: 'publish', name: '{1}' }];

	exports.make = function(instance) {
		instance.process = function(msg, client) {
			instance.send('publish', msg, client);
		};
	};

</script>

<style>
	.f-{5} .url { font-size: 11px; }
</style>

<readme>
	{2}
</readme>

<body>
	<div class="meta">
		<div><i class="{3} mr5"></i><span>{0}</span></div>
		<div class="url">{4}</div>
	</div>
	<div class="schema">{6}</div>
</body>`;

const TEMPLATE_SUBSCRIBE = `<script total>

	exports.name = '{0}';
	exports.icon = '{3}';
	exports.config = {};
	exports.inputs = [{ id: 'subscribe', name: '{1}' }];

	exports.make = function(instance) {
		instance.message = function(msg, client) {
			var socket = MAIN.sockets['{7}'];
			if (socket && socket.subscribers['{1}']) {
				/*
					var err = new ErrorBuilder();
					var data = framework_jsonschema.transform(schema, err, msg.data, true);
					if (data)
						socket.send({ type: 'subscribe', id: '{1}', data: data });
				*/
				socket.send({ type: 'subscribe', id: '{1}', data: msg.data });
			}
			msg.destroy();
		};
	};

</script>

<style>
	.f-{5} .url { font-size: 11px; }
</style>

<readme>
	{2}
</readme>

<body>
	<div class="meta">
		<div><i class="{3} mr5"></i><span>{0}</span></div>
		<div class="url">{4}</div>
	</div>
	<div class="schema">{6}</div>
</body>`;

FUNC.refresh2 = function() {
	setTimeout2('FUNC.refresh', FUNC.refresh, 1000);
};

function makeschema(item) {

	var str = '';

	for (var key in item.properties) {
		var prop = item.properties[key];
		str += '<div><code>{0}</code><span>{1}</span></div>'.format(key, prop.type);
	}

	return str;
}

FUNC.refresh = function(callback) {

	clearTimeout2('FUNC.refresh');

	MAIN.apps.wait(function(item, next) {

		if (item.init) {

			if (item.restart || !item.socket)
				connect(item, next);
			else
				next();

		} else {

			var index = item.url.indexOf('/', 10);
			var url = item.url.substring(0, index);

			if (item.meta.publish instanceof Array) {
				for (var i = 0; i < item.meta.publish.length; i++) {
					var m = item.meta.publish[i];
					var readme = [];

					readme.push('# ' + item.meta.name);
					readme.push('- URL address: <' + url + '>');
					readme.push('- Channel: __publish__');
					readme.push('- JSON schema `' + m.id + '.json`');

					readme.push('```json');
					readme.push(JSON.stringify(m.schema, null, '  '));
					readme.push('```');

					var id = 'pub' + item.id + 'X' + m.id;
					var com = TMS.instance.add(id, TEMPLATE_PUBLISH.format(item.meta.name, m.id, readme.join('\n'), m.icon || 'fas fa-broadcast-tower', m.url, id, makeschema(m.schema)));
					m.url = url;
					com.itemid = item.id;
					com.schema = m;
				}
			}

			if (item.meta.subscribe instanceof Array) {
				for (var i = 0; i < item.meta.subscribe.length; i++) {
					var m = item.meta.subscribe[i];
					var readme = [];

					readme.push('# ' + item.meta.name);
					readme.push('- URL address: <' + url + '>');
					readme.push('- Channel: __subscribe__');
					readme.push('- JSON schema `' + m.id + '.json`');

					readme.push('```json');
					readme.push(JSON.stringify(m, null, '  '));
					readme.push('```');

					var id = 'sub' + item.id + 'X' + m.id;
					var com = TMS.instance.add(id, TEMPLATE_SUBSCRIBE.format(item.meta.name, m.id, readme.join('\n'), m.icon || 'fas fa-satellite-dish', m.url, id, makeschema(m.schema), item.id));
					m.url = url;
					com.itemid = item.id;
					com.schema = m;
				}
			}

			if (item.socket)
				next();
			else
				connect(item, next);
		}

	}, function() {

		var components = TMS.instance.meta.components;
		var unregister = [];

		for (var key in components) {
			var type = key.substring(0, 3);
			if (type === 'pub' || type === 'sub') {
				var index = key.indexOf('X');
				if (index !== -1) {

					var appid = key.substring(3, index);
					var subid = key.substring(index + 1);
					var app = MAIN.apps.findItem('id', appid);

					if (app) {
						if (type === 'pub') {
							if (app.meta.publish instanceof Array) {
								if (app.meta.publish.findItem('id', subid))
									continue;
							}
						} else {
							if (app.meta.subscribe instanceof Array) {
								if (app.meta.subscribe.findItem('id', subid))
									continue;
							}
						}
					}

					unregister.push(key);
				}
			}
		}

		unregister.wait(function(key, next) {
			TMS.instance.unregister(key, next);
		}, function() {

			if (MAIN.ws) {
				MAIN.ws.send({ TYPE: 'flow/components', data: TMS.components() });
				MAIN.ws.send({ TYPE: 'flow/design', data: TMS.design() });
			}

			FUNC.save();
			callback && callback();
		});

	});

};

FUNC.readmeta = function(item, callback) {
	WEBSOCKETCLIENT(function(client) {

		if (item.token)
			client.headers['x-token'] = item.token;

		client.options.reconnect = 0;

		client.on('open', function() {
			client.tmsready = true;
		});

		client.on('error', function(err) {
			client.tmsready = false;
			callback(err);
			clearTimeout(client.timeout);
		});

		client.on('close', function() {
			client.tmsready = false;
		});

		client.on('message', function(msg) {
			switch (msg.type) {
				case 'meta':
					callback(null, msg);
					clearTimeout(client.timeout);
					client.close();
					break;
			}
		});

		client.timeout = setTimeout(function() {
			if (client.tmsready) {
				client.close();
				callback(408);
			}
		}, 1500);

		client.connect(item.url.replace(/^http/g, 'ws'));
	});
};
