var spawn = require('child_process').spawn;
var CecDevice = require('./cecdevice').CecDevice;
var EventEmitter = require('events');
var queue = require('queue');

class CecClient extends EventEmitter {

    constructor() {
        super();
        this.physicalMap = {};
        this.logicalMap = {};
        this.deviceList = [];
        this.notifiedAboutDevice = {};
    }

    init() {
        this.commandQueue = queue();
        this.commandQueue.concurrency = 1;
        this.commandQueue.timeout = 6000;

        this.cecProcess = spawn('cec-client');
        this.cecProcess.stdout.on('data', this.parseData.bind(this));
        this.cecProcess.stderr.on('data', this.parseData.bind(this));
        this.cecProcess.stdout.on('exit', this.streamClosed.bind(this));
        this.currentRoute = CecClient.PHYSICAL_ADDRESS_TV;
        this.addTvDevice();
    }

    streamClosed() {

    }

    getCurrentRoute() {
        return this.currentRoute;
    }

    setCurrentRoute(oldRoute, newRoute) {
        if((oldRoute != newRoute) || (oldRoute != this.currentRoute)) {
            this.currentRoute = newRoute;
            this.emit(CecClient.EVENT_TV_INPUT_CHANGE, oldRoute, newRoute);
        }
    }

    transmitCommand(command) {
        console.log('=-=-=-=-=-= Queuing Command Send: '+command);
        this.commandQueue.push((cb) => {
            console.log('=-=-=-=-=-= De-Queuing and Sending Command: '+command);
            this.cecProcess.stdin.write(command+'\n\r');
        });
        this.commandQueue.start();
    }

    requestChangeRoute(newRoute) {
        var commandToSend = 'tx '+ this.logicalAddress.toString(16) + CecClient.LID_BROADCAST.toString(16)+':';
        commandToSend += CecClient.MESSAGE_ID_ACTIVE_SOURCE + ':';
        commandToSend += newRoute[0] + newRoute[2] + ':' + newRoute[4] + newRoute[6];
        this.transmitCommand(commandToSend);
    }

    requestStandby(device) {
        var commandToSend = "standby "+device.getLogicalAddress().toString(16);
        this.transmitCommand(commandToSend);
    }

    requestOn(device) {
        var commandToSend = 'on '+device.getLogicalAddress().toString(16);
        this.transmitCommand(commandToSend);
    }

    raiseDeviceEventIfNeeded(device, changed) {
        if(this.notifiedAboutDevice[device.getLogicalAddress()] == undefined) {
            if(device.isReady()) {
                this.notifiedAboutDevice[device.getLogicalAddress()] = true;
                this.emit(CecClient.EVENT_NEW_DEVICE, device);
            }
        } else {
            if(changed) {
                this.emit(CecClient.EVENT_DEVICE_CHANGE, device);
            }
        }
    }

    addTvDevice() {
        var tvDevice = new CecDevice(CecClient.LID_TV);
        this.tvAdapter = tvDevice;
        this.addNewDevice(tvDevice);
        this.setDevicePhysicalAddress(CecClient.LID_TV, CecClient.PHYSICAL_ADDRESS_TV);
    }

    addLocalAdapter() {
        this.cecAdapter = new CecDevice(this.logicalAddress);
        this.addNewDevice(this.cecAdapter);
        this.setDeviceCecVersion(this.logicalAddress, CecClient.CEC_VERSION_14);
        this.setDeviceVendorId(this.logicalAddress, CecClient.VENDOR_ID_PULSEEIGHT);
        this.setDevicePowerStatus(this.logicalAddress, CecClient.POWER_STATUS_ON);
    }

    addNewDevice(device) {
        this.logicalMap[device.getLogicalAddress()] = device;
        this.deviceList.push(device);
    }

    addDeviceIfNeeded(logicalDeviceId) {
        if(this.logicalMap[logicalDeviceId] == undefined) {
            this.addNewDevice(new CecDevice(logicalDeviceId));
        }
    }

    setDeviceVendorId(logicalDeviceId, vendorId) {
        this.addDeviceIfNeeded(logicalDeviceId);
        var device = this.logicalMap[logicalDeviceId];
        var changed = device.setVendorId(vendorId);
        device.setVendorName(this.translateParameterValue(vendorId, CecClient.PARAMETER_TYPE_VENDOR_ID));
        this.raiseDeviceEventIfNeeded(device, changed);
    }

    setDevicePhysicalAddress(logicalDeviceId, physicalAddress) {
        this.addDeviceIfNeeded(logicalDeviceId);
        var device = this.logicalMap[logicalDeviceId];
        var changed = device.setPhysicalAddress(physicalAddress);
        this.physicalMap[physicalAddress] = device;
        this.raiseDeviceEventIfNeeded(device, changed);        
    }

    setDevicePowerStatus(logicalDeviceId, powerStatus) {
        this.addDeviceIfNeeded(logicalDeviceId);
        var device = this.logicalMap[logicalDeviceId];
        var changed = device.setPowerStatus(powerStatus);
        device.setPowerStatusName(this.translateParameterValue(powerStatus, CecClient.PARAMETER_TYPE_POWER_STATUS));
        this.raiseDeviceEventIfNeeded(device, changed);        
    }

    setDeviceCecVersion(logicalDeviceId, cecVersion) {
        this.addDeviceIfNeeded(logicalDeviceId);
        var device = this.logicalMap[logicalDeviceId];
        var changed = device.setCecVersion(cecVersion);
        device.setCecVersionName(this.translateParameterValue(cecVersion, CecClient.PARAMETER_TYPE_CEC_VERSION));
        this.raiseDeviceEventIfNeeded(device, changed);        
    }

    getDevices() {
        return this.deviceList;
    }

    getDeviceByLogicalAddress(logicalAddress) {
        if(this.logicalMap[logicalAddress] == undefined) {
            return null;
        } else {
            return this.logicalMap[logicalAddress];
        }
    }

    getDeviceByPhysicalAddress(physicalAddress) {
        if(this.physicalMap[physicalAddress] == undefined) {
            return null;
        } else {
            return this.physicalMap[physicalAddress];
        }
    }    

    isIncomingMessage(message) {
        if(message.indexOf('>>') != -1 && message.indexOf('TRAFFIC') != -1) { 
            return true;
        } else {
            return false;
        }
    }

    getMessageMapEntry(messageId) {
        for(var index = 0; index < CecClient.MessageTypeMap.length; index++) {
            if(CecClient.MessageTypeMap[index].id == messageId) {
                return CecClient.MessageTypeMap[index];
            }
        }
        return null;
    }

    parsePhysicalAddress(message, startIndex) {
        var resultData = this.parseParameterBytes(message, startIndex, 2);
        var physicalAddress = resultData.value[0]+'.'+resultData.value[1]+'.'+resultData.value[2]+'.'+resultData.value[3];
        var addressResult = { 
            value: physicalAddress,
            newStartIndex: resultData.newStartIndex
        };
        return addressResult;
    }

    parseLogicalAddress(message, startIndex) {
        var logicalAddress = parseInt(message[startIndex+2], 16);
        return {
            value: logicalAddress,
            newStartIndex: startIndex+3 
        };
    }

    parseSingleByteParameter(message, startIndex) {
        var result = message[startIndex+1]+message[startIndex+2];
        return {
            value: result.toUpperCase(),
            newStartIndex: startIndex+3
        }
    }

    parseParameterBytes(message, startIndex, numBytes) {
        var result = {
            value: "",
            newStartIndex: startIndex
        }
        for(var byteIndex = 0; byteIndex < numBytes; byteIndex++) {
            var nextResult = this.parseSingleByteParameter(message, result.newStartIndex);
            result.value += nextResult.value;
            result.newStartIndex = nextResult.newStartIndex;
        }
        return result;
    }

    parseParameter(message, parameterType, startIndex) {
        switch(parameterType) {
            case CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS:
                return this.parsePhysicalAddress(message, startIndex);
            case CecClient.PARAMETER_TYPE_LOGICAL_ADDRESS:
                return this.parseLogicalAddress(message, startIndex);
            case CecClient.PARAMETER_TYPE_CEC_VERSION:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_DECK_CONTROL_COMMAND:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_DECK_STATUS:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_VENDOR_ID:
                return this.parseParameterBytes(message, startIndex, 3);
            case CecClient.PARAMETER_TYPE_FEATURE_OPCODE:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_ABORT_REASON:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_STATUS_REQUEST_TYPE:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_MENU_REQUEST_TYPE:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_MENU_STATUS:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_PLAY_MODE:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_POWER_STATUS:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_AUDIO_RATE:
                return this.parseParameterBytes(message, startIndex, 1);
            case CecClient.PARAMETER_TYPE_MENU_LANGUAGE:
                return this.parseParameterBytes(message, startIndex, (message.length-startIndex)/3);
            case CecClient.PARAMETER_TYPE_OSD_NAME:
                return this.parseParameterBytes(message, startIndex, (message.length-startIndex)/3);
            case CecClient.PARAMETER_TYPE_OSD_DISPLAY_CONTROL:
                return this.parseParameterBytes(message, startIndex, (message.length-startIndex)/3);            
            case CecClient.PARAMETER_TYPE_AUDIO_MODE:
                return this.parseParameterBytes(message, startIndex, 1);
            default:
        }
    }

    translateParameterValue(value, parameterType) {
        if(parameterType == CecClient.PARAMETER_TYPE_LOGICAL_ADDRESS || parameterType == CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS) {
            return value;
        } else if(parameterType == CecClient.PARAMETER_TYPE_FEATURE_OPCODE) {
            var mapEntry = this.getMessageMapEntry(value);
            if(mapEntry == null) {
                return "<UNKNOWN OPCODE> ("+value+")";
            } else {
                return mapEntry.type;
            }
        }
        for(var index = 0; index < CecClient.ParameterValueMap.length; index++) {
            var mapEntry = CecClient.ParameterValueMap[index];
            if(mapEntry.id == parameterType && mapEntry.value == value) {
                return mapEntry.description;
            }
        }
        return "<UNKNOWN>("+value+")";
    }

    handleMessage(logicalDeviceId, messageType, parameters) {
        switch(messageType) {
            case CecClient.MESSAGE_ID_CEC_VERSION:
                this.setDeviceCecVersion(logicalDeviceId, parameters[0]);
                break;
            case CecClient.MESSAGE_ID_PHYSICAL_ADDRESS:
                this.setDevicePhysicalAddress(logicalDeviceId, parameters[0]);
                break;
            case CecClient.MESSAGE_ID_DEVICE_VENDOR_ID:
                this.setDeviceVendorId(logicalDeviceId, parameters[0]);
                break;
            case CecClient.MESSAGE_ID_POWER_STATUS:
                this.setDevicePowerStatus(logicalDeviceId, parameters[0]);
                break;
            case CecClient.MESSAGE_ID_STANDBY:
                this.setDevicePowerStatus(logicalDeviceId, CecClient.POWER_STATUS_STANDBY);
                break;
            case CecClient.MESSAGE_ID_ROUTING_CHANGE:
                this.setCurrentRoute(parameters[0], parameters[1]);
                break;
        }
    }

    parseFullMessage(message) {
        var messageContents = message.substring(message.indexOf('>>')+3);
        var fromLogicalId = parseInt(messageContents[0], 16);
        var fromId = this.getLogicalDeviceName(messageContents[0]) + "("+messageContents[0]+")";
        var toId = this.getLogicalDeviceName(messageContents[1]) + "("+messageContents[1]+")";
        var messageId = null;
        if(messageContents.length > 3) {
            messageId = messageContents.substring(3,5).toUpperCase();
        } 
        var messageEntry = this.getMessageMapEntry(messageId);
        if(messageEntry == null) {
            return "["+fromId+"=>"+toId+"]: Not yet parseable [ID="+messageId+"]";
        } else {
            var parameterFriendlyValues = [];
            var parameterIds = [];
            var startIndex = 5;
            for(var parameterIndex = 0; parameterIndex < messageEntry.parameters.length; parameterIndex++) {
                var result = this.parseParameter(messageContents, messageEntry.parameters[parameterIndex], startIndex);
                parameterIds.push(result.value);
                parameterFriendlyValues.push(this.translateParameterValue(result.value, messageEntry.parameters[parameterIndex]));
                startIndex = result.newStartIndex;
            }
            this.handleMessage(fromLogicalId, messageId, parameterIds);
            return "["+fromId+"=>"+toId+"]: "+messageEntry.description.replace("{0}", parameterFriendlyValues[0]).replace("{1}", parameterFriendlyValues[1]);
        }
        return messageContents;
    }

    parseData(data) {
        var lines = data.toString('utf8').split('\n');
        for(var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            if(this.isIncomingMessage(lines[lineIndex])) {
                console.log('MESSAGE: '+this.parseFullMessage(lines[lineIndex]));
            } else if(lines[lineIndex] == 'waiting for input') {
                console.log('Detected cec client is ready for input, requesting scan');
                this.cecProcess.stdin.write('scan\n\r');
            } else if(lines[lineIndex].indexOf("AllocateLogicalAddresses") != -1) {
                this.logicalAddress = Number(lines[lineIndex].substring(lines[lineIndex].length-2, lines[lineIndex].length-1));
                console.log('Detected local cec adapter address allocation. Using logical address: '+this.logicalAddress);
                this.addLocalAdapter();
            } else if(lines[lineIndex].indexOf("CEC client registered") != -1) {
                var startIndex = lines[lineIndex].indexOf("physical address: ");
                startIndex += 18;
                var physicalAddress = lines[lineIndex].substring(startIndex, startIndex+7);
                this.setDevicePhysicalAddress(this.logicalAddress, physicalAddress);
            }
        }
    }

    getLogicalDeviceName(deviceId) {
        var deviceIndex = parseInt(deviceId, 16);
        if(deviceIndex < CecClient.LogicalDeviceNameMap.length) {
            return CecClient.LogicalDeviceNameMap[deviceIndex];
        } else {
            return "Unknown";
        }
    }
}

CecClient.EVENT_NEW_DEVICE = "new_device";
CecClient.EVENT_DEVICE_CHANGE = "device_change";
CecClient.EVENT_TV_INPUT_CHANGE = 'input_changed';

CecClient.MESSAGE_ID_STANDBY = '36';
CecClient.MESSAGE_ID_SET_SYSTEM_AUDIO_MODE = '72';
CecClient.MESSAGE_ID_SET_STREAM_PATH = '86';
CecClient.MESSAGE_ID_SET_OSD_STRING = '64';
CecClient.MESSAGE_ID_SET_OSD_NAME = '47';
CecClient.MESSAGE_ID_SET_MENU_LANGUAGE = '32';
CecClient.MESSAGE_ID_SET_EXTERNAL_TIMER = 'A2';
CecClient.MESSAGE_ID_SET_DIGITAL_TIMER = '97';
CecClient.MESSAGE_ID_SET_AUDIO_RATE = '9A';
CecClient.MESSAGE_ID_SET_ANALOG_TIMER = '34';
CecClient.MESSAGE_ID_SELECT_DIGITAL_SERVICE = '93';
CecClient.MESSAGE_ID_SELECT_ANALOG_SERVICE = '92';
CecClient.MESSAGE_ID_ROUTING_INFO = '81';
CecClient.MESSAGE_ID_ROUTING_CHANGE = '80';
CecClient.MESSAGE_ID_GET_ACTIVE_SOURCE = '85';
CecClient.MESSAGE_ID_POWER_STATUS = '90';
CecClient.MESSAGE_ID_PHYSICAL_ADDRESS = '84';
CecClient.MESSAGE_ID_REPORT_AUDIO_STATUS = '7A";'
CecClient.MESSAGE_ID_RECORD_SCREEN = '0F';
CecClient.MESSAGE_ID_GET_RECORD_STATUS = '0A';
CecClient.MESSAGE_ID_RECORD_START = '09';
CecClient.MESSAGE_ID_RECORD_OFF = '0B';
CecClient.MESSAGE_ID_PLAY = '41';
CecClient.MESSAGE_ID_MENU_STATUS = '8E';
CecClient.MESSAGE_ID_MENU_REQUEST = '8D';
CecClient.MESSAGE_ID_INACTIVE_SOURCE = '9D';
CecClient.MESSAGE_ID_POLLING = null;
CecClient.MESSAGE_ID_ACTIVE_SOURCE = "82";
CecClient.MESSAGE_ID_CEC_VERSION = "9E";
CecClient.MESSAGE_ID_CLEAR_ANALOG_TIMER = "33";
CecClient.MESSAGE_ID_CLEAR_DIGITAL_TIMER = "99";
CecClient.MESSAGE_ID_CLEAR_EXTERNAL_TIMER = "A1";
CecClient.MESSAGE_ID_DECK_CONTROL = "42";
CecClient.MESSAGE_ID_DECK_STATUS = "1B";
CecClient.MESSAGE_ID_DEVICE_VENDOR_ID = "87";
CecClient.MESSAGE_ID_FEATURE_ABORT = '00'
CecClient.MESSAGE_ID_GET_CEC_VERSION = "9F";
CecClient.MESSAGE_ID_GET_MENU_LANGUAGE = "91";
CecClient.MESSAGE_ID_GET_AUDIO_STATUS = "71";
CecClient.MESSAGE_ID_GET_DECK_STATUS = "1A";
CecClient.MESSAGE_ID_GET_POWER_STATUS = "8F";
CecClient.MESSAGE_ID_GET_VENDOR_ID = "8C";
CecClient.MESSAGE_ID_GET_OSD_NAME = "46";
CecClient.MESSAGE_ID_GET_PHYSICAL_ADDRESS = "83";
CecClient.MESSAGE_ID_GET_AUDIO_MODE_STATUS = "7D";
CecClient.MESSAGE_ID_GET_TUNER_DEVICE_STATUS = "08";
CecClient.MESSAGE_ID_IMAGE_VIEW_ON = "04";

CecClient.CEC_VERSION_11 = "00";
CecClient.CEC_VERSION_12 = "01";
CecClient.CEC_VERSION_12A = "02";
CecClient.CEC_VERSION_13 = "03";
CecClient.CEC_VERSION_13A = "04";
CecClient.CEC_VERSION_14 = "05";

CecClient.VENDOR_ID_TOSHIBA = "000039";
CecClient.VENDOR_ID_SAMSUNG = "0000F0";
CecClient.VENDOR_ID_DENON = "0005CD";
CecClient.VENDOR_ID_MARANTZ = "000678";
CecClient.VENDOR_ID_LOEWE = "000982";
CecClient.VENDOR_ID_ONKYO = "0009B0";
CecClient.VENDOR_ID_MEDION = "000CB8";
CecClient.VENDOR_ID_TOSHIBA2 = "000CE7";
CecClient.VENDOR_ID_PULSEEIGHT = "001582";
CecClient.VENDOR_ID_HARMANKARDON2 = "001950";
CecClient.VENDOR_ID_GOOGLE = "001A11";
CecClient.VENDOR_ID_AKAIR = "0020C7";
CecClient.VENDOR_ID_AOC = "002467";
CecClient.VENDOR_ID_PANASONIC = "008045";
CecClient.VENDOR_ID_PHILIPS = "00903E";
CecClient.VENDOR_ID_DAEWOO = "009053";
CecClient.VENDOR_ID_YAMAHA = "00A0DE";
CecClient.VENDOR_ID_GRUNDIG = "00D0D5";
CecClient.VENDOR_ID_PIONEER = "00E036";
CecClient.VENDOR_ID_LG = "00E091";
CecClient.VENDOR_ID_SHARP = "08001F";
CecClient.VENDOR_ID_SONY = "080046";
CecClient.VENDOR_ID_BROADCOM = "18C086";
CecClient.VENDOR_ID_SHARP2 = "534850";
CecClient.VENDOR_ID_VIZIO = "6B746D";
CecClient.VENDOR_ID_BENQ = "8065E9";
CecClient.VENDOR_ID_HARMANKARDON = "9C645E";
CecClient.VENDOR_ID_VIZIO2 = "4D544B";
CecClient.VENDOR_ID_VIZIO3 = "9D1900";
CecClient.VENDOR_ID_APPLE = "0010FA";

CecClient.DECK_STATUS_PLAY = "11";
CecClient.DECK_STATUS_RECORD = "12";
CecClient.DECK_STATUS_PLAY_REVERSE = "13";
CecClient.DECK_STATUS_STILL = "14";
CecClient.DECK_STATUS_SLOW = "15";
CecClient.DECK_STATUS_SLOW_REVERSE = "16";
CecClient.DECK_STATUS_FAST_FORWARD = "17";
CecClient.DECK_STATUS_FAST_REVERSE = "18";
CecClient.DECK_STATUS_NO_MEDIA = "19";
CecClient.DECK_STATUS_STOP = "1A";
CecClient.DECK_STATUS_SKIP_FORWARD = '1B';
CecClient.DECK_STATUS_SKIP_REVERSE = '1C';
CecClient.DECK_STATUS_INDEX_SEARCH_FORWARD = '1D';
CecClient.DECK_STATUS_INDEX_SEARCH_REVERSE = '1E';
CecClient.DECK_STATUS_OTHER = '1F';

CecClient.DECK_CONTROL_MODE_SKIP_FORWARD = '01';
CecClient.DECK_CONTROL_MODE_SKIP_REWIND = '02';
CecClient.DECK_CONTROL_MODE_STOP = '03';
CecClient.DECK_CONTROL_MODE_EJECT = '04';

CecClient.ABORT_REASON_UNRECOGNIZED_OPCODE = "00";
CecClient.ABORT_REASON_NOT_IN_CORRECT_MODE_TO_RESPOND = "01";
CecClient.ABORT_REASON_CANNOT_PROVIDE_SOURCE = "02";
CecClient.ABORT_REASON_INVALID_OPERAND = "03";
CecClient.ABORT_REASON_REFUSED = "04";

CecClient.STATUS_REQUEST_ON = "01";
CecClient.STATUS_REQUEST_OFF = "02";
CecClient.STATUS_REQUEST_ONCE = "03";

CecClient.MENU_REQUEST_TYPE_ACTIVATE = "01";
CecClient.MENU_REQUEST_TYPE_DEACTIVATE = "02";
CecClient.MENU_REQUEST_TYPE_QUERY = "03";

CecClient.MENU_STATUS_ACTIVATED = "00";
CecClient.MENU_STATUS_DEACTIVATED = "01";

CecClient.AUDIO_MODE_OFF = "00";
CecClient.AUDIO_MODE_ON = "01";

CecClient.PLAY_MODE_PLAY_FORWARD = "24";
CecClient.PLAY_MODE_PLAY_REVERSE = "20";
CecClient.PLAY_MODE_PLAY_STILL = "25";
CecClient.PLAY_MODE_FAST_FORWARD_MIN_SPEED = "05";
CecClient.PLAY_MODE_FAST_FORWARD_MEDIUM_SPEED = "06";
CecClient.PLAY_MODE_FAST_FORWARD_MAX_SPEED = "07";
CecClient.PLAY_MODE_FAST_REVERSE_MIN_SPEED = "09";
CecClient.PLAY_MODE_FAST_REVERSE_MEDIUM_SPEED = "0A";
CecClient.PLAY_MODE_FAST_REVERSE_MAX_SPEED = "0B";
CecClient.PLAY_MODE_SLOW_FORWARD_MIN_SPEED = "15";
CecClient.PLAY_MODE_SLOW_FORWARD_MEDIUM_SPEED = "16";
CecClient.PLAY_MODE_SLOW_FORWARD_MAX_SPEED = "17";
CecClient.PLAY_MODE_SLOW_REVERSE_MIN_SPEED = "19";
CecClient.PLAY_MODE_SLOW_REVERSE_MEDIUM_SPEED = "1A";
CecClient.PLAY_MODE_SLOW_REVERSE_MAX_SPEED = "1B";

CecClient.POWER_STATUS_ON = "00";
CecClient.POWER_STATUS_STANDBY = "01";
CecClient.POWER_STATUS_IN_TRANSITION_STANDBY_TO_ON = "02";
CecClient.POWER_STATUS_IN_TRANSITION_ON_TO_STANDBY = "03";
CecClient.POWER_STATUS_UNKNOWN = "99";

CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS = 0;
CecClient.PARAMETER_TYPE_LOGICAL_ADDRESS = 1;
CecClient.PARAMETER_TYPE_CEC_VERSION = 2;
CecClient.PARAMETER_TYPE_DECK_CONTROL_COMMAND = 3;
CecClient.PARAMETER_TYPE_DECK_STATUS = 4;
CecClient.PARAMETER_TYPE_VENDOR_ID = 5;
CecClient.PARAMETER_TYPE_FEATURE_OPCODE = 6;
CecClient.PARAMETER_TYPE_ABORT_REASON = 7;
CecClient.PARAMETER_TYPE_STATUS_REQUEST_TYPE = 8;
CecClient.PARAMETER_TYPE_MENU_REQUEST_TYPE = 9;
CecClient.PARAMETER_TYPE_MENU_STATUS = 10;
CecClient.PARAMETER_TYPE_PLAY_MODE = 11;
CecClient.PARAMETER_TYPE_POWER_STATUS = 12;
CecClient.PARAMETER_TYPE_AUDIO_RATE = 13;
CecClient.PARAMETER_TYPE_MENU_LANGUAGE = 14;
CecClient.PARAMETER_TYPE_OSD_NAME = 15;
CecClient.PARAMETER_TYPE_OSD_DISPLAY_CONTROL = 16;
CecClient.PARAMETER_TYPE_AUDIO_MODE = 17;

CecClient.PHYSICAL_ADDRESS_TV = "0.0.0.0";

CecClient.LID_TV = 0;
CecClient.LID_REC1 = 1;
CecClient.LID_REC2 = 2;
CecClient.LID_TUNE1 = 3;
CecClient.LID_PLAY1 = 4;
CecClient.LID_AUDIO = 5;
CecClient.LID_TUNE2 = 6;
CecClient.LID_TUNE3 = 7;
CecClient.LID_PLAY2 = 8;
CecClient.LID_PLAY3 = 9;
CecClient.LID_TUNE4 = 10;
CecClient.LID_PLAY3 = 11;
CecClient.LID_RESERVE1 = 12;
CecClient.LID_RESERVE2 = 13;
CecClient.LID_RESERVE3 = 14;
CecClient.LID_BROADCAST = 15;

CecClient.MessageTypeMap = [
    { type: "Polling", id: CecClient.MESSAGE_ID_POLLING, parameters: [], description: "{s} is pinging the {t}" },
    { type: "Active Source", id: CecClient.MESSAGE_ID_ACTIVE_SOURCE, parameters: [CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS], description: "I am transmitting to address {0}" },
    { type: "Cec Version", id: CecClient.MESSAGE_ID_CEC_VERSION, parameters: [CecClient.PARAMETER_TYPE_CEC_VERSION], description: "I support Cec protocol version {0}"},
    { type: "Clear Analog Timer", id: CecClient.MESSAGE_ID_CLEAR_ANALOG_TIMER, parameters: [], description: "Clear your analog timer" },
    { type: "Clear Digital Timer", id: CecClient.MESSAGE_ID_CLEAR_DIGITAL_TIMER, parameters: [], description: "Clear your digital timer" },
    { type: "Clear External Timer", id: CecClient.MESSAGE_ID_CLEAR_EXTERNAL_TIMER, parameters: [], description: "{s} => {t}; Clear your external timer"},
    { type: "Deck Control", id: CecClient.MESSAGE_ID_DECK_CONTROL, parameters: [CecClient.PARAMETER_TYPE_DECK_CONTROL_COMMAND], description: "Execute deck control command {0}" },
    { type: "Deck Status", id: CecClient.MESSAGE_ID_DECK_STATUS, parameters: [CecClient.PARAMETER_TYPE_DECK_STATUS], description: "My deck status is {0}" },
    { type: "Feature Abort", id: CecClient.MESSAGE_ID_FEATURE_ABORT, parameters: [CecClient.PARAMETER_TYPE_FEATURE_OPCODE, CecClient.PARAMETER_TYPE_ABORT_REASON], description: "OpCode {0} not supported, reason: {1}"},
    { type: "Device Vendor ID", id: CecClient.MESSAGE_ID_DEVICE_VENDOR_ID, parameters: [CecClient.PARAMETER_TYPE_VENDOR_ID], description: "My vendor id is {0}" },
    { type: "Get Cec Version", id: CecClient.MESSAGE_ID_GET_CEC_VERSION, parameters: [], description: "What version of CEC do you support?"},
    { type: "Get Menu Language", id: CecClient.MESSAGE_ID_GET_MENU_LANGUAGE, parameters: [], description: "What is your menu language?"},
    { type: "Get Audio Status", id: CecClient.MESSAGE_ID_GET_AUDIO_STATUS, parameters: [], description: "What is your audio status?"}, 
    { type: "Get Deck Status", id: CecClient.MESSAGE_ID_GET_DECK_STATUS, parameters: [CecClient.PARAMETER_TYPE_STATUS_REQUEST_TYPE], description: "Get your deck status for type: {0}"},
    { type: "Get Power Status", id: CecClient.MESSAGE_ID_GET_POWER_STATUS, parameters: [], description: "What is your power status?"},
    { type: "Get Vendor ID", id: CecClient.MESSAGE_ID_GET_VENDOR_ID, parameters: [], description: "What is your vendor Id?"},
    { type: "Get OSD Name", id: CecClient.MESSAGE_ID_GET_OSD_NAME, parameters: [], description: "What is your OSD name?"},
    { type: "Get Physical Address", id: CecClient.MESSAGE_ID_GET_PHYSICAL_ADDRESS, parameters: [], description: "What is your physical address?"},
    { type: "Get Tuner Device Status", id: CecClient.MESSAGE_ID_GET_TUNER_DEVICE_STATUS, parameters: [CecClient.PARAMETER_TYPE_STATUS_REQUEST_TYPE], description: "What is your tuner device status of {0}"},
    { type: "Image View On", id: CecClient.MESSAGE_ID_IMAGE_VIEW_ON, parameters: [], description: "I am active!"},
    { type: "Device is going inactive", id: CecClient.MESSAGE_ID_INACTIVE_SOURCE, parameters: [CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS], description: "I have been deactivated on address {0} by user action"},
    { type: "Menu Request", id: CecClient.MESSAGE_ID_MENU_REQUEST, parameters: [CecClient.PARAMETER_TYPE_MENU_REQUEST_TYPE], description: "Execute a menu request of type: {0}"},
    { type: "Menu Status", id: CecClient.MESSAGE_ID_MENU_STATUS, parameters: [CecClient.PARAMETER_TYPE_MENU_STATUS], description: "My menu status is now: {0}"},
    { type: "Play", id: CecClient.MESSAGE_ID_PLAY, parameters: [CecClient.PARAMETER_TYPE_PLAY_MODE], description: "Set play mode to: {0}"},
    { type: "Stop Recording", id: CecClient.MESSAGE_ID_RECORD_OFF, parameters: [], description: "Stop recording"},
    { type: "Start Recording", id: CecClient.MESSAGE_ID_RECORD_START, parameters: [], description: "Start recording"},
    { type: "Get Record Status", id: CecClient.MESSAGE_ID_GET_RECORD_STATUS, parameters: [], description: "What is your recording status"},
    { type: "Start recording current source", id: CecClient.MESSAGE_ID_RECORD_SCREEN, parameters: [], description: "Record currently displayed source"},
    { type: "Audio status", id: CecClient.MESSAGE_ID_REPORT_AUDIO_STATUS, parameters: [], description: "My audio status is: {0}, volume: {1}"},
    { type: "Physical Address", id: CecClient.MESSAGE_ID_PHYSICAL_ADDRESS, parameters: [CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS, CecClient.PARAMETER_TYPE_LOGICAL_ADDRESS], description: "My physical address is: {0} for logical address: {1}"},
    { type: "Power Status", id: CecClient.MESSAGE_ID_POWER_STATUS, parameters: [CecClient.PARAMETER_TYPE_POWER_STATUS], description: "My power status is {0}"},
    { type: "Get Active Source", id: CecClient.MESSAGE_ID_GET_ACTIVE_SOURCE, parameters: [], description: "What is your active source?"},
    { type: "Routing Change", id: CecClient.MESSAGE_ID_ROUTING_CHANGE, parameters: [CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS, CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS], description: "Route has changed from {0} to {1}"},
    { type: "Route", id: CecClient.MESSAGE_ID_ROUTING_INFO, parameters: [CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS, CecClient], description: "Route is now {0}"},
    { type: "Select Analog Service", id: CecClient.MESSAGE_ID_SELECT_ANALOG_SERVICE, parameters: [], description: "Set your analog service as specified"},
    { type: "Select Digital Service", id: CecClient.MESSAGE_ID_SELECT_DIGITAL_SERVICE, parameters: [], description: "Set your digital service as specified"},        
    { type: "Set Analog Timer", id: CecClient.MESSAGE_ID_SET_ANALOG_TIMER, parameters: [], description: "Set your analog timer as specified"},        
    { type: "Set Audio Rate", id: CecClient.MESSAGE_ID_SET_AUDIO_RATE, parameters: [], description: "Set your audio rate to {0}"},        
    { type: "Set Digital Timer", id: CecClient.MESSAGE_ID_SET_DIGITAL_TIMER, parameters: [], description: "Set your digital timer as specified"},        
    { type: "Set External Timer", id: CecClient.MESSAGE_ID_SET_EXTERNAL_TIMER, parameters: [], description: "Set your external timer as specified"},        
    { type: "Set Menu Language", id: CecClient.MESSAGE_ID_SET_MENU_LANGUAGE, parameters: [CecClient.PARAMETER_TYPE_MENU_LANGUAGE], description: "Set your menu language to {0}"},        
    { type: "Set OSD Name", id: CecClient.MESSAGE_ID_SET_OSD_NAME, parameters: [CecClient.PARAMETER_TYPE_OSD_NAME], description: "Set your menu language to {0}"},        
    { type: "Set OSD String", id: CecClient.MESSAGE_ID_SET_OSD_STRING, parameters: [CecClient.PARAMETER_TYPE_OSD_DISPLAY_CONTROL, CecClient.PARAMETER_TYPE_OSD_NAME], description: "Show message [{1}] for period: [{0}]" },
    { type: "Set Stream Path", id: CecClient.MESSAGE_ID_SET_STREAM_PATH, parameters: [CecClient.PARAMETER_TYPE_PHYSICAL_ADDRESS], description: "Set your stream path to {0}"},
    { type: "Set System Audio Mode", id: CecClient.MESSAGE_ID_SET_SYSTEM_AUDIO_MODE, parameters: [CecClient.PARAMETER_TYPE_AUDIO_MODE], description: "Set your audio mode to {0}"},
    { type: "Standby", id: CecClient.MESSAGE_ID_STANDBY, parameters: [], description: "I am going into standby, you should probably as well"},    
];

CecClient.LogicalDeviceNameMap = [
    "TV",
    "Recording 1",
    "Recording 2",
    "Tuner 1",
    "Playback 1",
    "Audio system",
    "Tuner 2",
    "Tuner 3",
    "Playback 2",
    "Playback 3",
    "Tuner 4",
    "Playback 4",
    "Reserved(C)",
    "Reserved(D)",
    "Reserved(E)",    
    "Broadcast"
];    

CecClient.ParameterValueMap = [
    { id: CecClient.PARAMETER_TYPE_CEC_VERSION, value: CecClient.CEC_VERSION_11, description: "1.1" },
    { id: CecClient.PARAMETER_TYPE_CEC_VERSION, value: CecClient.CEC_VERSION_12, description: "1.2" },
    { id: CecClient.PARAMETER_TYPE_CEC_VERSION, value: CecClient.CEC_VERSION_12A, description: "1.2a" },
    { id: CecClient.PARAMETER_TYPE_CEC_VERSION, value: CecClient.CEC_VERSION_13, description: "1.3" },
    { id: CecClient.PARAMETER_TYPE_CEC_VERSION, value: CecClient.CEC_VERSION_13A, description: "1.3a" },                
    { id: CecClient.PARAMETER_TYPE_CEC_VERSION, value: CecClient.CEC_VERSION_13A, description: "1.3a" },
    { id: CecClient.PARAMETER_TYPE_CEC_VERSION, value: CecClient.CEC_VERSION_14, description: "1.4" },
    { id: CecClient.PARAMETER_TYPE_DECK_CONTROL_COMMAND, value: CecClient.DECK_CONTROL_MODE_SKIP_FORWARD, description: "Skip Forward" },
    { id: CecClient.PARAMETER_TYPE_DECK_CONTROL_COMMAND, value: CecClient.DECK_CONTROL_MODE_SKIP_REWIND, description: "Skip Rewind" },
    { id: CecClient.PARAMETER_TYPE_DECK_CONTROL_COMMAND, value: CecClient.DECK_CONTROL_MODE_STOP, description: "Skip Stop" },
    { id: CecClient.PARAMETER_TYPE_DECK_CONTROL_COMMAND, value: CecClient.DECK_CONTROL_MODE_EJECT, description: "Skip Eject" },            
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_PLAY, description: "Play" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_RECORD, description: "Record" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_PLAY_REVERSE, description: "Play Reverse" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_STILL, description: "Still" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_SLOW, description: "Slow" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_SLOW_REVERSE, description: "Slow Reverese" },                    
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_FAST_FORWARD, description: "Fast Forward" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_FAST_REVERSE, description: "Fast Reverse" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_NO_MEDIA, description: "No Media" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_STOP, description: "Stop" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_SKIP_FORWARD, description: "Skip Forward" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_SKIP_REVERSE, description: "Skip Reverse" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_INDEX_SEARCH_FORWARD, description: "Search Forward" },
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_INDEX_SEARCH_REVERSE, description: "Search Reverse" },                
    { id: CecClient.PARAMETER_TYPE_DECK_STATUS, value: CecClient.DECK_STATUS_OTHER, description: "Other" },       
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_TOSHIBA, description: "Toshiba" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_SAMSUNG, description: "Samsung" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_DENON, description: "Denon" },    
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_MARANTZ, description: "Marantz" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_ONKYO, description: "Onkyo" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_MEDION, description: "Medion" },                         
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_TOSHIBA2, description: "Toshiba2" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_PULSEEIGHT, description: "PulseEight" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_HARMANKARDON2, description: "HarmanKardon2" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_GOOGLE, description: "Google" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_AKAIR, description: "Akair" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_AOC, description: "AOC" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_PANASONIC, description: "Panasonic" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_PHILIPS, description: "Philips" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_DAEWOO, description: "Daewoo" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_YAMAHA, description: "Yamaha" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_GRUNDIG, description: "Grundig" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_PIONEER, description: "Pioneer" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_LG, description: "LG" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_SHARP, description: "Sharp" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_SONY, description: "Sony" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_BROADCOM, description: "Broadcom" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_SHARP2, description: "Sharp2" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_VIZIO, description: "Vizio" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_BENQ, description: "BenQ" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_VIZIO2, description: "Vizio2" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_VIZIO3, description: "Vizio3" },
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_APPLE, description: "Apple" },    
    { id: CecClient.PARAMETER_TYPE_VENDOR_ID, value: CecClient.VENDOR_ID_HARMANKARDON, description: "HarmanKardon" },
    { id: CecClient.PARAMETER_TYPE_ABORT_REASON, value: CecClient.ABORT_REASON_UNRECOGNIZED_OPCODE, description: "Unrecognized Opcode" },
    { id: CecClient.PARAMETER_TYPE_ABORT_REASON, value: CecClient.ABORT_REASON_NOT_IN_CORRECT_MODE_TO_RESPOND, description: "Not In Correct Mode To Respond" },
    { id: CecClient.PARAMETER_TYPE_ABORT_REASON, value: CecClient.ABORT_REASON_CANNOT_PROVIDE_SOURCE, description: "Cannot Provide Service" },
    { id: CecClient.PARAMETER_TYPE_ABORT_REASON, value: CecClient.ABORT_REASON_INVALID_OPERAND, description: "Invalid Operand" },
    { id: CecClient.PARAMETER_TYPE_ABORT_REASON, value: CecClient.ABORT_REASON_REFUSED, description: "Refused" },                
    { id: CecClient.PARAMETER_TYPE_STATUS_REQUEST_TYPE, value: CecClient.STATUS_REQUEST_ON, description: "On" },
    { id: CecClient.PARAMETER_TYPE_STATUS_REQUEST_TYPE, value: CecClient.STATUS_REQUEST_OFF, description: "Off" },
    { id: CecClient.PARAMETER_TYPE_STATUS_REQUEST_TYPE, value: CecClient.STATUS_REQUEST_ONCE, description: "Once" },
    { id: CecClient.PARAMETER_TYPE_MENU_REQUEST_TYPE, value: CecClient.MENU_REQUEST_TYPE_ACTIVATE, description: "Activate" },
    { id: CecClient.PARAMETER_TYPE_MENU_REQUEST_TYPE, value: CecClient.MENU_REQUEST_TYPE_DEACTIVATE, description: "Deactivate" },
    { id: CecClient.PARAMETER_TYPE_MENU_REQUEST_TYPE, value: CecClient.MENU_REQUEST_TYPE_QUERY, description: "Query" },
    { id: CecClient.PARAMETER_TYPE_MENU_STATUS, value: CecClient.MENU_STATUS_ACTIVATED, description: "Activated" },
    { id: CecClient.PARAMETER_TYPE_MENU_STATUS, value: CecClient.MENU_STATUS_DEACTIVATED, description: "Deactivated" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_PLAY_FORWARD, description: "Play Forward" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_PLAY_REVERSE, description: "Reverse" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_PLAY_STILL, description: "Still" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_FAST_FORWARD_MIN_SPEED, description: "Forward Min Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_FAST_FORWARD_MEDIUM_SPEED, description: "Forward Med Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_FAST_FORWARD_MAX_SPEED, description: "Forward Max Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_FAST_REVERSE_MIN_SPEED, description: "Reverse Min Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_FAST_REVERSE_MEDIUM_SPEED, description: "Reverse Medium Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_FAST_REVERSE_MAX_SPEED, description: "Reverse Max Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_SLOW_FORWARD_MIN_SPEED, description: "Forward Min Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_SLOW_FORWARD_MEDIUM_SPEED, description: "Forward Med Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_SLOW_FORWARD_MAX_SPEED, description: "Forward Max Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_SLOW_REVERSE_MIN_SPEED, description: "Reverse Min Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_SLOW_REVERSE_MEDIUM_SPEED, description: "Reverse Med Speed" },
    { id: CecClient.PARAMETER_TYPE_PLAY_MODE, value: CecClient.PLAY_MODE_SLOW_REVERSE_MAX_SPEED, description: "Reverse Max Speed" },
    { id: CecClient.PARAMETER_TYPE_POWER_STATUS, value: CecClient.POWER_STATUS_ON, description: "On" },
    { id: CecClient.PARAMETER_TYPE_POWER_STATUS, value: CecClient.POWER_STATUS_STANDBY, description: "Standby" },
    { id: CecClient.PARAMETER_TYPE_POWER_STATUS, value: CecClient.POWER_STATUS_IN_TRANSITION_STANDBY_TO_ON, description: "Transition Standby To On" },
    { id: CecClient.PARAMETER_TYPE_POWER_STATUS, value: CecClient.POWER_STATUS_IN_TRANSITION_ON_TO_STANDBY, description: "Transition On to Standby" },
    { id: CecClient.PARAMETER_TYPE_POWER_STATUS, value: CecClient.POWER_STATUS_UNKNOWN, description: "Unknown" },
    { id: CecClient.PARAMETER_TYPE_AUDIO_MODE, value: CecClient.AUDIO_MODE_OFF, description: "Off" },
    { id: CecClient.PARAMETER_TYPE_AUDIO_MODE, value: CecClient.AUDIO_MODE_ON, description: "On" }
];

exports.CecClient = CecClient;
