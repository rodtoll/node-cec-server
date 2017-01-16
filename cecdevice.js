/**
 * Created by rodtoll on 1/16/17.
 */

class CecDevice {
    constructor(logicalAddress) {
        this.logicalAddress = logicalAddress;
        this.physicalAddress = null;
        this.vendorId = null;
        this.vendorName = null;
        this.powerStatus = null;
        this.powerStatusName = null;
        this.cecVersion = null;
        this.cecVersionName = null;
    }

    getStatus() {
        return "LAD: "+this.logicalAddress+" PA: "+this.physicalAddress+" VENDOR: "+this.vendorName+" CEC: "+this.cecVersionName+" Power: "+this.powerStatusName;
    }

    isReady() {
        return(this.physicalAddress != null && this.vendorName != null && this.powerStatusName != null);
    }

    getLogicalAddress() {
        return this.logicalAddress;
    }

    getPhysicalAddress() {
        return this.physicalAddress;
    }

    setPhysicalAddress(physicalAddress) {
        if(this.physicalAddress != physicalAddress) {
            this.physicalAddress = physicalAddress;
            return true;
        } else {
            return false;
        }
    }

    setPowerStatus(powerStatus) {
        if(this.powerStatus != powerStatus) {
            this.powerStatus = powerStatus;
            return true;
        } else {
            return false;
        }
    }

    getPowerStatus() {
        return this.powerStatus;
    }

    setVendorId(vendorId) {
        if(this.vendorId != vendorId) {
            this.vendorId = vendorId;
            return true;
        } else {
            return false;
        }
    }

    getVendorId() {
        return this.vendorId;
    }

    setVendorName(vendorName) {
        this.vendorName = vendorName;
    }

    getVendorName() {
        return this.vendorName;
    }

    setPowerStatusName(powerStatusName) {
        this.powerStatusName = powerStatusName;
    }

    getPowerStatusName() {
        return this.powerStatusName;
    }

    getCecVersion() {
        return this.cecVersion;
    }

    getCecVersionName() {
        return this.cecVersionName;
    }

    setCecVersion(cecVersion) {
        if(this.cecVersion != cecVersion) {
            this.cecVersion = cecVersion;
            return true;
        } else {
            return false;
        }
    }

    setCecVersionName(cecVersionName) {
        this.cecVersionName = cecVersionName;
    }
}

exports.CecDevice = CecDevice;