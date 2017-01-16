var CecClient = require('./cecclient').CecClient;
var express = require('express');

class NodeCecServer {
    constructor(port) {
        this.app = express();
        this.port = port;
        this.cecClient = new CecClient();
        this.setupCecHandlers();
    }

    configureRoutes() {
        this.app.get('/rest/device', this.handleDeviceCollectionGet.bind(this));
        this.app.put('/rest/command/:command/:parameter', this.handleDeviceCommandPut.bind(this));
    }

    handleDeviceCollectionGet(req, res) {
        res.json(this.cecClient.getDevices());
    }

    handleDeviceCommandPut(req, res) {
        var command = req.params.command;
        var parameter = req.params.parameter;

        if(command == undefined || parameter == undefined) {
            res.status(500).end();
        }

        command = command.toLowerCase();
        parameter = parameter.toLowerCase();

        if(command == "standby") {
            var device = this.cecClient.getDeviceByPhysicalAddress(parameter);
            if(device == null) {
                res.status(404).end();
            } else {
                console.log('########################## Request to turnof device: '+device.getStatus());
                this.cecClient.requestStandby(device);
                res.status(200).end();
            }
        } else if(command == "on") {
            var device = this.cecClient.getDeviceByPhysicalAddress(parameter);
            if(device == null) {
                res.status(404).end();
            } else {
                console.log('########################## Request to turn on device: '+device.getStatus());
                this.cecClient.requestOn(device);
                res.status(200).end();
            }
        } else if(command == "input") {
            console.log('########################## Request to change input to physical address: '+parameter);
            this.cecClient.requestChangeRoute(parameter);
            res.status(200).end();
        }
    }

    setupCecHandlers() {
        this.cecClient.on(CecClient.EVENT_NEW_DEVICE, (device) => {
            console.log('################## Device Created: DEVICE MAP ==');
            var deviceList = this.cecClient.getDevices();
            for(var index = 0; index < deviceList.length; index++) {
                if(deviceList[index].isReady()) {
                    console.log( "==> "+deviceList[index].getStatus());
                }
            }
        });

        this.cecClient.on(CecClient.EVENT_DEVICE_CHANGE, (device) => {
            console.log('################## Device Changed: '+device.getStatus());
        });

        this.cecClient.on(CecClient.EVENT_TV_INPUT_CHANGE, (oldAddress, newAddress) => {
            var oldDevice = this.cecClient.getDeviceByPhysicalAddress(oldAddress);
            var newDevice = this.cecClient.getDeviceByPhysicalAddress(newAddress);
            console.log('################## Switching inputs:');
            console.log('OLD DEVICE: '+oldDevice.getStatus());
            console.log('NEW DEVICE: '+newDevice.getStatus());
        });
    }

    start() {
        this.cecClient.init();
        this.configureRoutes();
        var server = this.app.listen(this.port, function () {
            var host = server.address().address;
            var port = server.address().port;

            console.log('node-cec-server app listening at http://%s:%s', host, port);
        });
    }

}

var server = new NodeCecServer(6100);
server.start();
