exports.install = function() {
	// Socket
	ROUTE('+SOCKET  /tms/', socket, 1024 * 5);
};

function socket() {
	var self = this;
	MODULE('flowstream').socket('tms', self);
}