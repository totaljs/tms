exports.install = function() {

	// API
	ROUTE('+API     /api/    -apps              *Apps   --> query');
	ROUTE('+API     /api/    -apps_read/id      *Apps   --> read');
	ROUTE('+API     /api/    +apps_save         *Apps   --> meta save (response)');
	ROUTE('+API     /api/    -apps_remove/id    *Apps   --> remove');

	// Socket
	ROUTE('+SOCKET  /', socket);
};

function notify(msg) {
	var arr = TMS.instance.instances();
	arr.wait(function(com, next) {
		com[msg.TYPE] && com[msg.TYPE](msg);
		setImmediate(next);
	}, 3);
}

function socket() {

	var self = this;
	var timeout;

	MAIN.ws = self;
	self.autodestroy(() => MAIN.ws = null);

	var refreshstatus = function() {

		timeout = null;
		var arr = TMS.instance.instances();

		// Sends last statuses
		arr.wait(function(com, next) {
			com.status();
			setImmediate(next);
		}, 3);

	};

	self.on('open', function(client) {
		timeout && clearTimeout(timeout);
		timeout = setTimeout(refreshstatus, 1500);
		client.send({ TYPE: 'flow/components', data: TMS.components() });
		client.send({ TYPE: 'flow/design', data: TMS.design() });
	});

	self.on('message', function(client, message) {
		switch (message.TYPE) {
			case 'status':
				notify(message);
				break;
			case 'trigger':
				var instance = TMS.instance.meta.flow[message.id];
				instance && instance.trigger && instance.trigger(message);
				break;
			case 'reconfigure':
				TMS.instance.reconfigure(message.id, message.data);
				TMS.save(TMS.instance.export());
				break;
			case 'save':
				TMS.instance.use(CLONE(message.data), function(err) {
					err && ERROR(err);
					TMS.save(TMS.instance.export());
					TMS.synchronize(true);
				});
				self.send({ TYPE: 'flow/design', data: message.data }, conn => conn !== client);
				break;
		}
	});
}