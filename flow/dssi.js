exports.id = 'dssi';
exports.title = 'MQTT DSSI broker';
exports.group = 'MQTT DSSI';
exports.color = '#656D78';
exports.version = '1.0.0';
exports.icon = 'clock-o';
exports.input = false;
exports.output = 0;
exports.author = 'Herve Prot';
exports.options = {
    "hostname": "symeos.net",
    "port": "1883",
    "qos": 1
};
exports.npm = ['symeos-mqtt'];

/*exports.html = `<div class="padding">
	<section>
		<label><i class="fa fa-exchange"></i>@(Broker)</label>
		<div class="padding npb">
			<div class="row">
				<div class="col-md-6">
					<div data-jc="textbox" data-jc-path="uuid" class="m">UUID</div>
				</div>
				<div class="col-md-6">
					<div data-jc="textbox" data-jc-path="token" class="m">Token</div>
				</div>
			</div>
		</div>
	</section>
</div>`;*/

exports.readme = `
# MQTT DSSI Broker


`;

var DSSI_MQTT_BROKERS = [];
global.MQTT_DSSI = {};

exports.install = function(instance) {

    var broker;

    instance.custom.reconfigure = function(o, old_options) {

        var options = instance.options = CONFIG('symeosnet');

        if (!options.uuid || !options.token) {
            instance.status('Not configured', 'red');
            return;
        }

        options.id = options.uuid; // + ':' + options.port;

        if (broker)
            JSON.stringify(options) !== JSON.stringify(old_options) && broker.reconfigure(options);
        else
            instance.custom.createBroker();
    };

    instance.custom.createBroker = function() {
        ON('mqtt.brokers.status', brokerstatus);
        broker = new Broker(instance.options);
        //broker.connect();
        instance.status('Ready', 'white');
        DSSI_MQTT_BROKERS.push(broker);
    };

    instance.close = function(done) {
        broker && broker.close(function() {
            DSSI_MQTT_BROKERS = DSSI_MQTT_BROKERS.remove('id', instance.options.id);
            EMIT('mqtt.brokers.status', 'removed', instance.options.id);
            done();
        });
        OFF('mqtt.brokers.status', brokerstatus);
    };

    function brokerstatus(status, brokerid) {
        if (brokerid !== instance.options.id)
            return;

        switch (status) {
            case 'connecting':
                instance.status('Connecting', '#a6c3ff');
                break;
            case 'connected':
                instance.status('Connected', 'green');
                break;
            case 'disconnected':
                instance.status('Disconnected', 'red');
                break;
            case 'connectionfailed':
                instance.status('Connection failed', 'red');
                break;
        };
    };

    instance.on('options', instance.custom.reconfigure);
    instance.custom.reconfigure();
};

FLOW.trigger('mqtt.brokers', function(next) {
    var brokers = [''];
    DSSI_MQTT_BROKERS.forEach(n => brokers.push(n.id));
    next(brokers);
});

MQTT_DSSI.add = function(brokerid, componentid) {
    var broker = DSSI_MQTT_BROKERS.findItem('id', brokerid);

    if (broker) {
        broker.add(componentid);
        return true;
    }

    return false;
};

MQTT_DSSI.remove = function(brokerid, componentid) {
    var broker = DSSI_MQTT_BROKERS.findItem('id', brokerid);
    broker && broker.remove(componentid);
};

MQTT_DSSI.publish = function(brokerid, topic, data, options) {
    var broker = DSSI_MQTT_BROKERS.findItem('id', brokerid);
    if (broker)
        broker.publish(topic, data, options);
    else
        EMIT('mqtt.brokers.status', 'error', brokerid, 'No such broker');
};

MQTT_DSSI.subscribe = function(brokerid, componentid, topic, qos) {
    var broker = DSSI_MQTT_BROKERS.findItem('id', brokerid);
    broker && broker.subscribe(componentid, topic, qos);
};

MQTT_DSSI.unsubscribe = function(brokerid, componentid, topic, qos) {
    var broker = DSSI_MQTT_BROKERS.findItem('id', brokerid);
    broker && broker.unsubscribe(componentid, topic);
};

MQTT_DSSI.broker = function(brokerid) {
    return DSSI_MQTT_BROKERS.findItem('id', brokerid);
};

/*

	https://github.com/mqttjs/MQTT_DSSI.js/blob/master/examples/client/secure-client.js

*/

/*
	TODO

	- add `birth` and `last will and testament` messages
	- add options to self.client.connect(broker [,options]); - credentials, certificate etc.


*/

function Broker(options) {
    var self = this;

    if (!options.hostname || !options.port)
        return false;

    self.connecting = false;
    self.connected = false;
    self.closing = false;
    self.components = [];
    self.subscribtions = {};
    self.id = options.id;
    self.options = options;
    setTimeout(function() {
        EMIT('mqtt.brokers.status', 'new', self.id);
    }, 500);
    return self;
}

Broker.prototype.connect = function() {

    var Symeos = require('symeos-mqtt');

    var self = this;
    if (self.connected || self.connecting)
        return EMIT('mqtt.brokers.status', self.connected ? 'connected' : 'connecting', self.id);

    self.connecting = true;
    //var broker = self.options.secure ? 'mqtts://' : 'mqtt://' + self.options.host + ':' + self.options.port;

    EMIT('mqtt.brokers.status', 'connecting', self.id);

    //self.client = mqtt.connect(broker);
    self.client = new Symeos(self.options);

    self.client.connect(function(response) {
        console.log('Connected to SymeosNet');
        // Update Device - response emits event 'config'
        self.client.update({ uuid: self.options.uuid, type: CONFIG('name') });
    });

    self.client.on('connect', function() {
        self.connecting = false;
        self.connected = true;
        EMIT('mqtt.brokers.status', 'connected', self.id);
    });

    self.client.on('reconnect', function() {
        self.connecting = true;
        self.connected = false;
        EMIT('mqtt.brokers.status', 'connecting', self.id);
    });

    self.client.on('message', function(message) {
        //console.log('recieved message', message);

        EMIT('mqtt.brokers.message', self.id, message.payload, message.fromUuid, message.callbackId);
    });

    self.client.on('offline', function() {
        if (self.connected) {
            self.connected = false;
            EMIT('mqtt.brokers.status', 'disconnected', self.id);
        } else if (self.connecting) {
            self.connecting = false;
            EMIT('mqtt.brokers.status', 'connectionfailed', self.id);
        }
    });

    self.client.on('error', function(err) {
        console.log('ERROR ', self.id, err);

        if (self.connecting) {
            //self.client.end();
            self.connecting = false;
            EMIT('mqtt.brokers.status', 'connectionfailed', self.id);
        }
    });

};

Broker.prototype.disconnect = function() {
    var self = this;
    if (!self.closing && !self.components.length && self.client && self.client.connected)
        self.client.end();
};

Broker.prototype.reconfigure = function(options) {
    var self = this;
    if (self.closing)
        return;

    self.options = options;

    if (self.connected) {
        self.disconnect();
        self.connect();
    }
};

Broker.prototype.subscribe = function(componentid, topic, qos) {
    var self = this;
    self.subscribtions[topic] = self.subscribtions[topic] || [];
    if (self.subscribtions[topic].indexOf(componentid) > -1)
        return;
    self.client.subscribe(topic, qos || 0);
    self.subscribtions[topic].push(componentid);
};

Broker.prototype.unsubscribe = function(componentid, topic) {
    var self = this;
    var subscription = self.subscribtions[topic];
    if (subscription) {
        subscription = subscription.remove(componentid);
        self.client.connected && !subscription.length && self.client.unsubscribe(topic);
    }
};

Broker.prototype.publish = function(devices, data, options) {
    var self = this;

    if (!self.connected || !data)
        return;

    /*if (typeof(data) === 'object') {
        options.qos = parseInt(data.qos || options.qos);
        options.retain = data.retain || options.retain;
        topic = data.topic || topic;
        data.payload && (data = typeof(data.payload) === 'string' ? data.payload : JSON.stringify(data.payload));
    }*/

    if (options.qos !== 0 || options.qos !== 1 || options.qos !== 2)
        options.qos = null;

    self.client.message({
        devices: devices,
        payload: data,
        qos: 1
    });
};

Broker.prototype.close = function(callback) {
    var self = this;
    self.closing = true;

    if (self.connected || self.connecting)
        self.client.end(callback);
    else
        callback();

    self.client.removeAllListeners();
};

Broker.prototype.add = function(componentid) {
    var self = this;
    self.components.indexOf(componentid) === -1 && self.components.push(componentid);
    self.connect();
};

Broker.prototype.remove = function(componentid) {
    var self = this;
    self.components = self.components.remove(componentid);
    self.disconnect();
};