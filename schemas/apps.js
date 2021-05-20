NEWSCHEMA('Apps', function(schema) {

	schema.define('id', UID);
	schema.define('url', String, true);
	schema.define('token', String);

	schema.addWorkflow('meta', function($, model) {

		var item = MAIN.apps.findItem('url', model.url);
		if (item && item.id !== model.id) {
			$.invalid('@(The source already exists in the database.)');
			return;
		}

		FUNC.readmeta(model, function(err, response) {

			if (err) {
				$.invalid(err);
				return;
			}

			model.meta = response;
			$.success();
		});
	});

	schema.setQuery(function($) {
		var output = [];
		for (var i = 0; i < MAIN.apps.length; i++) {
			var app = MAIN.apps[i];
			output.push({ id: app.id, url: app.url, name: app.meta.name, dtcreated: app.dtcreated, online: !!app.socket, error: app.error });
		}
		$.callback(output);
	});

	schema.setRemove(function($) {
		var id = $.id;
		var index = MAIN.apps.findIndex('id', id);
		if (index !== -1) {
			var app = MAIN.apps[index];
			MAIN.apps.splice(index, 1);
			FUNC.refresh();
			FUNC.save();
			app.socket && app.socket.close();
			$.success();
		} else
			$.invalid(404);
	});

	schema.setRead(function($) {
		var id = $.id;
		var app = MAIN.apps.findItem('id', id);
		if (app)
			$.callback({ id: id, url: app.url, token: app.token });
		else
			$.invalid(404);
	});

	schema.setSave(function($, model) {

		var item = model.id ? MAIN.apps.findItem('id', model.id) : null;
		if (item) {
			item.url = model.url;
			item.token = model.token;
			item.dtupdated = NOW;
			item.meta = model.meta;
			item.checksum = HASH(JSON.stringify(model.meta)) + '';
			item.restart = true;
		} else {
			model.id = UID();
			model.dtcreated = NOW;
			model.restart = true;
			model.checksum = HASH(JSON.stringify(model.meta)) + '';
			MAIN.apps.push(model);
		}

		FUNC.refresh();
		FUNC.save();
		$.success();
	});

});