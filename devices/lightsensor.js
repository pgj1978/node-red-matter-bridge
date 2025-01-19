const  {Endpoint}  = require("@matter/main");
const  {BridgedDeviceBasicInformationServer}  = require("@matter/main/behaviors");
const  {LightSensorDevice} = require("@matter/main/devices")
const { batFeatures, batCluster } = require("../battery");

module.exports = {
    lightsensor: function(child) {
        const device = new Endpoint(
            LightSensorDevice.with(BridgedDeviceBasicInformationServer,  ... child.bat ? batCluster(child) : []), {
                id: child.id,
                bridgedDeviceBasicInformation: {
                    nodeLabel: child.name,
                    productName: child.name,
                    productLabel: child.name,
                    serialNumber: child.id,
                    reachable: true,
                },
                illuminanceMeasurement: {
                    minMeasuredValue: Math.floor(10000*Math.log10(child.minlevel) +1),
                    maxMeasuredValue: Math.floor(10000*Math.log10(child.maxlevel) +1),
                    measuredValue : child.measuredValue ? child.measuredValue : 0
                },
                ... child.bat? {powerSource: batFeatures(child)}: {}
            }
            )
            return device;
    }
 }

