const  { Endpoint }  = require("@matter/main");
const  { BridgedDeviceBasicInformationServer }  = require("@matter/main/behaviors")
const  { ColorTemperatureLightDevice }  = require( "@matter/main/devices")
const  { ColorControlServer } = require( "@matter/main/behaviors")
const  { ColorControl }  = require( "@matter/main/clusters")

module.exports = {
    colortemplight: function(child) {
        const device = new Endpoint(
            ColorTemperatureLightDevice.with(BridgedDeviceBasicInformationServer, ColorControlServer.with(
                ColorControl.Feature.ColorTemperature,
            ), ... child.bat? [PowerSourceServer.with(PowerSource.Feature.Battery, PowerSource.Feature.Rechargeable)]: []), {
                id: child.id,
                bridgedDeviceBasicInformation: {
                    nodeLabel: child.name,
                    productName: child.name,
                    productLabel: child.name,
                    serialNumber: child.id,
                    reachable: true,
                },
                colorControl: {
                    coupleColorTempToLevelMinMireds: 0x00FA,
                    startUpColorTemperatureMireds: 0x00FA,
                },
                ... child.bat? {powerSource: {
                    status: PowerSource.PowerSourceStatus.Active,
                    order: 1,
                    description: "Battery",
                    batFunctionalWhileCharging: true,
                    batChargeLevel: PowerSource.BatChargeLevel.Ok,
                    batChargeState: PowerSource.BatChargeState.Unknown,
                    batReplacementNeeded: false,
                    batReplaceability: PowerSource.BatReplaceability.Unspecified,
                }}: {}
            }
            )
            return device;
    }
 }