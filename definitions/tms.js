const DESIGN_FILE = 'design.json';
const APPS_FILE = 'apps.json';
const DIRECTORY = CONF.directory || PATH.root('tms');

var TMS = {};

PATH.mkdir(DIRECTORY);

TMS.instance = FLOWSTREAM('default', ERROR('FlowStream error'));

// Interval for statistics
TMS.instance.interval = 5000;

TMS.error = function(err, name) {
	console.log('TMS error - ' + name, err instanceof ErrorBuilder ? err.plain() : err);
};

// Captures stats from the Flow
TMS.instance.on('stats', function() {
	if (MAIN.ws) {
		TMS.instance.stats.TYPE = 'flow/stats';
		MAIN.ws.send(TMS.instance.stats);
	}
});

// component.status() will execute this method
TMS.instance.onstatus = function(status) {

	var instance = this;

	if (status == null)
		status = instance.currentstatus;
	else
		instance.currentstatus = status;

	if (status != null)
		MAIN.ws && MAIN.ws.send({ TYPE: 'flow/status', id: instance.id, data: status });

};

// component.dashboard() will execute this method
TMS.instance.ondashboard = function(status) {

	var instance = this;

	if (status == null)
		status = instance.dashboardstatus;
	else
		instance.dashboardstatus = status;

	if (status != null)
		MAIN.ws && MAIN.ws.send({ TYPE: 'dashboard', id: instance.id, component: instance.component, data: status });

};

// Refresh all components
TMS.refresh = function(callback) {
	PATH.fs.readdir(DIRECTORY, function(err, files) {
		files.wait(function(item, next) {
			if ((/\.html$/).test(item)) {
				PATH.fs.readFile(PATH.join(DIRECTORY, item), function(err, response) {
					TMS.instance.add(item.replace(/\.html/g, ''), response.toString('utf8'));
					next();
				});
			} else
				next();
		}, callback);
	});
};

TMS.components = function() {
	var arr = TMS.instance.components(true);

	for (var i = 0; i < arr.length; i++) {
		var item = arr[i];
		item.schema = TMS.instance.meta.components[item.id].schema;
	}

	return arr;
};

// Reads designer
TMS.json = function(callback) {
	PATH.fs.readFile(PATH.join(DIRECTORY, DESIGN_FILE), function(err, response) {
		callback(null, response ? response.toString('utf8').parseJSON(true) : {});
	});
};

TMS.save = function(data) {
	PATH.fs.writeFile(PATH.join(DIRECTORY, DESIGN_FILE), JSON.stringify(data), ERROR('TMS.save'));
};

TMS.load = function() {
	PATH.fs.readFile(PATH.join(DIRECTORY, DESIGN_FILE), function(err, response) {
		if (response) {
			TMS.instance.use(response.toString('utf8').parseJSON(true), function(err) {
				err && TMS.error(err, 'TMS.load()');
				TMS.ready = true;
				TMS.synchronize();
			});
		}
	});
};

TMS.design = function() {
	return TMS.instance.export();
};

TMS.synchronize = function(force) {

	var sync = {};

	for (var key in TMS.instance.meta.components) {
		var com = TMS.instance.meta.components[key];
		if (com.itemid)
			sync[com.itemid] = MAIN.apps.findItem('id', com.itemid);
	}

	for (var key in sync) {
		var app = sync[key];
		if (app && app.socket && (force || !app.socket.synchronized))
			app.socket.synchronize();
	}
};

FUNC.save = function() {
	var data = JSON.stringify(MAIN.apps, (key, value) => key !== 'socket' ? value : undefined);
	PATH.fs.writeFile(PATH.join(DIRECTORY, APPS_FILE), data, NOOP);
};

FUNC.load = function() {
	PATH.fs.readFile(PATH.join(DIRECTORY, APPS_FILE), function(err, data) {
		if (data) {
			MAIN.apps = data.toString('utf8').parseJSON(true) || [];
			for (var i = 0; i < MAIN.apps.length; i++)
				MAIN.apps[i].init = false;
			FUNC.refresh();
		} else
			MAIN.apps = [];
	});
};

ON('ready', function() {

	TMS.refresh(TMS.load);
	FUNC.load();

	// Tries to refresh all components in five seconds interval
	DEBUG && setInterval(TMS.refresh, 5000);

});

global.TMS = TMS;